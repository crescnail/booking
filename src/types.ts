export type TimeSlot = string;

export interface Customer {
  user_id: string;
  name: string;
  phone: string;
  is_blacklisted: boolean;
  member_code?: string; // 新增會員編號 (例如: CN-1A2B)
  created_at?: string;
}

export interface Booking {
  id: string;
  user_id: string;
  booking_date: string; // YYYY-MM-DD
  booking_time: string;
  service_type: string;
  remove_gel: boolean;
  status: 'confirmed' | 'cancelled' | 'completed';
  created_at: string;
  // Snapshot data for UI display if needed, or fetched via join
  customer_name_snapshot?: string;
  customer_phone_snapshot?: string;
}

export interface DayAvailability {
  date: string; // ISO string YYYY-MM-DD
  isAvailable: boolean; // Has configured slots AND has remaining slots
  bookedCount: number; // Number of slots already taken
  availableSlots: TimeSlot[]; // The specific slots remaining for this day
  totalSlots: number; // Total slots originally configured
}

export const SERVICES = [
  { id: '6_finger_creative', label: '6指自由創作' },
  { id: '10_finger_creative', label: '10指自由創作' },
  { id: 'monthly_special', label: '本月精選' },
  { id: 'classic_special', label: '典藏精選' },
  { id: 'magnetic', label: '貓眼' },
] as const;
