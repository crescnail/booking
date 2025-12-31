import { supabase } from '../supabaseClient';
import { DayAvailability, TimeSlot } from '../types';
import { startOfMonth, endOfMonth, format } from 'date-fns';

export const checkIsBlacklisted = async (userId: string): Promise<boolean> => {
  if (!userId) return false;
  
  const { data, error } = await supabase
    .from('blacklist')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error checking blacklist:', error);
    return false;
  }

  return !!data;
};

export const fetchAvailability = async (year: number, month: number): Promise<DayAvailability[]> => {
  const startDate = new Date(year, month, 1);
  const endDate = endOfMonth(startDate);
  
  const startStr = format(startDate, 'yyyy-MM-dd');
  const endStr = format(endDate, 'yyyy-MM-dd');

  const [bookingsResult, blockedDatesResult] = await Promise.all([
    supabase.rpc('get_occupied_slots', { 
        start_date: startStr, 
        end_date: endStr 
    }),
      
    supabase
      .from('blocked_dates')
      .select('blocked_date')
      .gte('blocked_date', startStr)
      .lte('blocked_date', endStr)
  ]);

  if (bookingsResult.error) console.error('Error fetching bookings:', bookingsResult.error);
  if (blockedDatesResult.error) console.error('Error fetching blocked dates:', blockedDatesResult.error);

  const bookings = bookingsResult.data || [];
  const blockedDates = new Set((blockedDatesResult.data || []).map((b: any) => b.blocked_date));

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
  const allSlots: TimeSlot[] = ['11:00', '15:30', '20:00'];

  for (let i = 1; i <= daysInMonth; i++) {
    const dateObj = new Date(year, month, i);
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    
    const isAdminBlocked = blockedDates.has(dateStr);

    const occupiedSlots = bookingsMap[dateStr] || [];
    const bookedCount = occupiedSlots.length;

    let availableSlots: TimeSlot[] = allSlots.filter(
        slot => !occupiedSlots.includes(slot)
    );

    if (bookedCount >= 2) {
        availableSlots = [];
    }

    const isSunday = dateObj.getDay() === 0;
    const isAvailable = !isSunday && !isAdminBlocked;

    result.push({
      date: dateStr,
      isAvailable: isAvailable, 
      bookedCount: bookedCount,
      availableSlots: isAvailable ? availableSlots : [],
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