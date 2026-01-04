import { supabase } from '../supabaseClient';
import { DayAvailability, Booking, Customer, SERVICES } from '../types';
import { endOfMonth, format } from 'date-fns';
import { N8N_WEBHOOK_URL } from '../constants';

/**
 * 0. 呼叫 Supabase Edge Function 驗證 LINE Token
 */
export const verifyLineLogin = async (idToken: string): Promise<string> => {
  try {
    const { data, error } = await supabase.functions.invoke('line-auth', {
      body: { idToken },
    });

    if (error) {
      console.error('Supabase Edge Function Error:', error);
      throw error;
    }

    if (!data || !data.userId) {
      throw new Error('Invalid response from auth function');
    }

    return data.userId;
  } catch (err) {
    console.error('Verify Line Token Failed:', err);
    throw err;
  }
};

/**
 * 1. 檢查顧客狀態 (包含是否為黑名單、會員編號)
 */
export const getCustomerProfile = async (userId: string): Promise<Customer | null> => {
  if (!userId) return null;
  
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Error fetching customer profile:', error.message);
    return null;
  }

  return data as Customer;
};

/**
 * 2. 讀取排班表與剩餘名額
 */
export const fetchAvailability = async (year: number, month: number): Promise<DayAvailability[]> => {
  const startDate = new Date(year, month, 1);
  const endDate = endOfMonth(startDate);
  
  const startStr = format(startDate, 'yyyy-MM-dd');
  const endStr = format(endDate, 'yyyy-MM-dd');

  // A. 抓取 Admin 設定的「開放時段表」 (Availabilities)
  const availabilityResult = await supabase
    .from('availabilities')
    .select('date, slots')
    .gte('date', startStr)
    .lte('date', endStr);

  if (availabilityResult.error) {
      console.error('Error fetching availabilities:', availabilityResult.error);
      throw new Error("無法讀取排班資料");
  }

  // B. 抓取已經被預約走的時段 (Bookings)
  const bookingsResult = await supabase.rpc('get_occupied_slots', { 
      start_date: startStr, 
      end_date: endStr 
  });

  const configuredDays = availabilityResult.data || [];
  const bookings = bookingsResult.data || [];

  // C. 計算邏輯
  const configMap: Record<string, string[]> = {};
  configuredDays.forEach((d: any) => {
    configMap[d.date] = d.slots;
  });

  const bookingsMap: Record<string, string[]> = {};
  bookings.forEach((b: any) => {
    const dateKey = b.booking_date;
    if (!bookingsMap[dateKey]) {
      bookingsMap[dateKey] = [];
    }
    bookingsMap[dateKey].push(b.booking_time); 
  });

  const daysInMonth = endDate.getDate();
  const result: DayAvailability[] = [];

  for (let i = 1; i <= daysInMonth; i++) {
    const dateObj = new Date(year, month, i);
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    
    const configuredSlots = configMap[dateStr];
    
    // 如果資料庫沒設定這天 => 休息
    if (!configuredSlots || configuredSlots.length === 0) {
        result.push({
            date: dateStr,
            isAvailable: false,
            bookedCount: 0,
            availableSlots: [],
            totalSlots: 0
        });
        continue;
    }

    const occupiedSlots = bookingsMap[dateStr] || [];
    const availableSlots = configuredSlots.filter(
        slot => !occupiedSlots.includes(slot)
    );

    result.push({
      date: dateStr,
      isAvailable: availableSlots.length > 0, 
      bookedCount: occupiedSlots.length,
      availableSlots: availableSlots.sort(),
      totalSlots: configuredSlots.length
    });
  }

  return result;
};

/**
 * 3. 提交預約 (包含建立/更新顧客資料 -> 寫入資料庫 -> 觸發 n8n)
 */
export const submitBooking = async (data: any) => {
    console.log("Submitting booking...", data);
    
    // Step A: Upsert Customer (建立或更新顧客資料)
    const customerPayload: any = {
        user_id: data.userId,
        name: data.name,
        phone: data.phone,
        updated_at: new Date().toISOString()
    };

    if (data.memberCode) {
        customerPayload.member_code = data.memberCode;
    }

    const { error: customerError } = await supabase
        .from('customers')
        .upsert(customerPayload, { onConflict: 'user_id' });

    if (customerError) {
        console.error('Error updating customer:', customerError);
        throw new Error('無法建立顧客資料');
    }

    // Step B: Insert Booking into Supabase
    const bookingPayload = {
        user_id: data.userId,
        customer_name_snapshot: data.name,
        customer_phone_snapshot: data.phone,
        service_type: data.serviceType,
        booking_date: data.date,
        booking_time: data.time,
        remove_gel: data.removeGel,
        status: 'confirmed',
        modification_count: 0 // 新預約預設為 0
    };

    const { error: bookingError } = await supabase
        .from('bookings')
        .insert([bookingPayload]);

    if (bookingError) {
        console.error('Submission error:', bookingError);
        throw bookingError;
    }

    // Step C: Trigger n8n Webhook (Send Flex Message)
    if (N8N_WEBHOOK_URL) {
        try {
            // 轉換 service id 為中文標籤，方便 n8n 直接顯示
            const serviceLabel = SERVICES.find(s => s.id === data.serviceType)?.label || data.serviceType;
            
            const n8nPayload = {
                ...bookingPayload,
                service_label: serviceLabel,
                member_code: data.memberCode,
                // 傳送額外需要的資訊給 Flex Message
                line_display_name: data.lineDisplayName || data.name
            };

            // 使用 fetch 發送 (Fire and forget，我們不需要等待 n8n 回應才顯示成功)
            fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(n8nPayload),
            }).catch(err => console.error("n8n trigger failed (background):", err));
            
        } catch (e) {
            console.warn("Failed to prepare n8n payload", e);
        }
    }
    
    return { success: true };
};

/**
 * 4. 獲取用戶歷史預約紀錄
 */
export const fetchUserBookings = async (userId: string): Promise<Booking[]> => {
    const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', userId)
        .order('booking_date', { ascending: false }) // 降冪排列 (最新的在上面)
        .order('booking_time', { ascending: false });

    if (error) {
        console.error('Error fetching history:', error);
        return [];
    }

    return data as Booking[];
};
