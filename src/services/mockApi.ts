import { supabase } from '../supabaseClient';
import { DayAvailability, Booking, Customer } from '../types';
import { endOfMonth, format } from 'date-fns';

/**
 * 1. 檢查顧客狀態 (包含是否為黑名單)
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
    // 這樣可以確保顧客資料庫永遠是最新的，且不會重複建立
    const customerPayload = {
        user_id: data.userId,
        name: data.name,
        phone: data.phone,
        updated_at: new Date().toISOString()
        // is_blacklisted 預設為 false，這裡不更新它以免覆蓋 Admin 的設定
    };

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
