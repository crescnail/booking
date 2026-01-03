import { supabase } from '../supabaseClient';
import { DayAvailability, Booking, Customer } from '../types';
import { endOfMonth, format } from 'date-fns';

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
 * 3. 提交預約 (包含建立/更新顧客資料)
 */
export const submitBooking = async (data: any) => {
    console.log("Submitting booking...", data);
    
    // Step A: Upsert Customer (建立或更新顧客資料)
    // 我們需要確保如果這個用戶已經有 member_code，不要覆蓋掉它
    // 如果是新用戶，則使用前端傳來的 newMemberCode (或是在後端生成，這裡簡化為使用 payload 內的)
    
    const customerPayload: any = {
        user_id: data.userId,
        name: data.name,
        phone: data.phone,
        updated_at: new Date().toISOString()
    };

    // 只有當傳入 data 有 memberCode 時才嘗試更新 (通常是新客)
    // 舊客如果已經有 member_code， Supabase upsert 預設行為：如果欄位沒在 payload 裡，通常不會動它？
    // 不，Supabase upsert 會覆蓋。所以我們必須確保：
    // 如果是舊客，data.memberCode 應該要帶原本的。
    // 如果是新客，data.memberCode 是新生成的。
    if (data.memberCode) {
        customerPayload.member_code = data.memberCode;
    }

    // 為了安全起見，我們可以先忽略 member_code 的更新，除非我們確定它是空的
    // 但為了簡化流程，我們假設 App 端已經邏輯判斷好：
    // "如果是舊客，memberCode 帶的是舊的；如果是新客，帶的是新的"
    
    // 改用 select 檢查是否存在比較保險，但為了效能，我們直接 upsert
    // 這裡我們做一個優化：使用 Supabase 的特性，如果不想覆蓋某些欄位，可能需要先查再寫，
    // 但因為 mockApi 的邏輯是 App 已經先查過了 (getCustomerProfile)，
    // 所以我們信任 App 傳來的 memberCode 是正確的 (舊客傳舊的，新客傳新的)。

    const { error: customerError } = await supabase
        .from('customers')
        .upsert(customerPayload, { onConflict: 'user_id' });

    if (customerError) {
        console.error('Error updating customer:', customerError);
        throw new Error('無法建立顧客資料');
    }

    // Step B: Insert Booking
    const bookingPayload = {
        user_id: data.userId,
        customer_name_snapshot: data.name,
        customer_phone_snapshot: data.phone,
        service_type: data.serviceType,
        booking_date: data.date,
        booking_time: data.time,
        remove_gel: data.removeGel,
        status: 'confirmed'
    };

    const { error: bookingError } = await supabase
        .from('bookings')
        .insert([bookingPayload]);

    if (bookingError) {
        console.error('Submission error:', bookingError);
        throw bookingError;
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
