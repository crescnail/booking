import { supabase } from '../supabaseClient';
import { DayAvailability } from '../types';
import { endOfMonth, format } from 'date-fns';

export const checkIsBlacklisted = async (userId: string): Promise<boolean> => {
  if (!userId) return false;
  
  const { data, error } = await supabase
    .from('blacklist')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Error checking blacklist:', error.message);
    return false;
  }

  return !!data;
};

export const fetchAvailability = async (year: number, month: number): Promise<DayAvailability[]> => {
  const startDate = new Date(year, month, 1);
  const endDate = endOfMonth(startDate);
  
  const startStr = format(startDate, 'yyyy-MM-dd');
  const endStr = format(endDate, 'yyyy-MM-dd');

  // 1. 抓取「排班表」 (Whitelist)
  // 資料庫有這筆日期 = 有營業；沒有這筆日期 = 休假
  const availabilityResult = await supabase
    .from('daily_availability')
    .select('date, slots')
    .gte('date', startStr)
    .lte('date', endStr);

  if (availabilityResult.error) {
      console.error('Error fetching availability:', availabilityResult.error);
      throw new Error("無法讀取排班資料");
  }

  // 2. 抓取「已預約時段」
  const bookingsResult = await supabase.rpc('get_occupied_slots', { 
      start_date: startStr, 
      end_date: endStr 
  });

  if (bookingsResult.error) {
       console.error('Error fetching bookings:', bookingsResult.error);
  }

  const configuredDays = availabilityResult.data || [];
  const bookings = bookingsResult.data || [];

  // 建立對照表
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
    
    // 邏輯核心：
    // 1. 檢查排班表有沒有這天？沒有 => Rest (Total 0)
    // 2. 有的話，扣掉已預約的 => Available
    
    const configuredSlots = configMap[dateStr];
    
    // Case 1: 沒排班 (休假)
    if (!configuredSlots || configuredSlots.length === 0) {
        result.push({
            date: dateStr,
            isAvailable: false,
            bookedCount: 0,
            availableSlots: [],
            totalSlots: 0 // 標記為 0 代表原本就沒開
        });
        continue;
    }

    const occupiedSlots = bookingsMap[dateStr] || [];
    
    // Case 2: 有排班，計算剩餘
    const availableSlots = configuredSlots.filter(
        slot => !occupiedSlots.includes(slot)
    );

    result.push({
      date: dateStr,
      isAvailable: availableSlots.length > 0, 
      bookedCount: occupiedSlots.length,
      availableSlots: availableSlots.sort(),
      totalSlots: configuredSlots.length // 標記 > 0 代表有開
    });
  }

  return result;
};

export const submitBooking = async (data: any) => {
    console.log("Submitting to Supabase...", data);
    
    const payload = {
        user_id: data.userId,
        name: data.name,
        phone: data.phone,
        service_type: data.serviceType,
        booking_date: data.date,
        booking_time: data.time,
        remove_gel: data.removeGel,
        status: 'confirmed'
    };

    const { error } = await supabase
        .from('bookings')
        .insert([payload]);

    if (error) {
        console.error('Submission error:', error);
        throw error;
    }
    
    return { success: true };
};
