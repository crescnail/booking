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

  // 1. Fetch configured availability (Whitelist)
  // Only days present in this table are considered "Open"
  const availabilityResult = await supabase
    .from('daily_availability')
    .select('date, slots')
    .gte('date', startStr)
    .lte('date', endStr);

  // 2. Fetch existing confirmed bookings
  const bookingsResult = await supabase.rpc('get_occupied_slots', { 
      start_date: startStr, 
      end_date: endStr 
  });

  if (availabilityResult.error) console.error('Error fetching availability:', availabilityResult.error);
  if (bookingsResult.error) console.error('Error fetching bookings:', bookingsResult.error);

  const configuredDays = availabilityResult.data || [];
  const bookings = bookingsResult.data || [];

  // Map configured slots: { "2024-05-20": ["11:00", "15:30"] }
  const configMap: Record<string, string[]> = {};
  configuredDays.forEach((d: any) => {
    configMap[d.date] = d.slots;
  });

  // Map booked slots: { "2024-05-20": ["11:00"] }
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
    
    // Default Closed: If not in configMap, it's not available
    const configuredSlots = configMap[dateStr];
    
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
    
    // Filter out taken slots
    const availableSlots = configuredSlots.filter(
        slot => !occupiedSlots.includes(slot)
    );

    result.push({
      date: dateStr,
      isAvailable: availableSlots.length > 0, 
      bookedCount: occupiedSlots.length,
      availableSlots: availableSlots.sort(), // Sort times for display
      totalSlots: configuredSlots.length
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
