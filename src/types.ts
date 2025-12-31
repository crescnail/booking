export type TimeSlot = '11:00' | '15:30' | '20:00';

export interface BookingState {
  userId: string;
  selectedDate: Date | null;
  selectedTime: TimeSlot | null;
  name: string;
  phone: string;
  serviceType: string;
  removeGel: boolean; // true = yes, false = no
  agreedToTerms: boolean;
}

export interface DayAvailability {
  date: string; // ISO string YYYY-MM-DD
  isAvailable: boolean; // Admin open/close
  bookedCount: number; // Max 2
  availableSlots: TimeSlot[];
}

export const SERVICES = [
  { id: '6_finger_creative', label: '6指自由創作' },
  { id: '10_finger_creative', label: '10指自由創作' },
  { id: 'monthly_special', label: '本月精選' },
  { id: 'classic_special', label: '典藏精選' },
  { id: 'magnetic', label: '貓眼' },
] as const;