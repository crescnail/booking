import React from 'react';
import { Booking, SERVICES } from '../types';
import { format, isPast, parseISO } from 'date-fns';
import { Calendar, Clock, Sparkles } from 'lucide-react';

interface UserHistoryProps {
  bookings: Booking[];
  loading: boolean;
}

export const UserHistory: React.FC<UserHistoryProps> = ({ bookings, loading }) => {
  if (loading) {
    return <div className="text-center text-gray-400 text-sm py-4">載入紀錄中...</div>;
  }

  if (bookings.length === 0) {
    return (
        <div className="text-center bg-white p-6 rounded-xl border border-dashed border-cresc-200">
            <p className="text-cresc-400 text-sm">尚無預約紀錄</p>
        </div>
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => {
        const dateObj = parseISO(booking.booking_date);
        const isHistory = isPast(dateObj) && booking.status !== 'cancelled';
        const isCancelled = booking.status === 'cancelled';
        
        let statusColor = "bg-cresc-50 border-cresc-100 text-cresc-800"; // Default: Confirmed
        let statusLabel = "已預約";

        if (isCancelled) {
            statusColor = "bg-gray-50 border-gray-100 text-gray-400 grayscale opacity-70";
            statusLabel = "已取消";
        } else if (isHistory) {
            statusColor = "bg-white border-cresc-100 text-cresc-600";
            statusLabel = "已完成";
        } else {
            // Future confirmed
            statusColor = "bg-white border-l-4 border-l-cresc-800 border-y border-r border-cresc-100 shadow-sm";
        }

        const serviceLabel = SERVICES.find(s => s.id === booking.service_type)?.label || booking.service_type;

        return (
          <div key={booking.id} className={`relative p-5 rounded-lg border ${statusColor} transition-all`}>
             <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold tracking-wider uppercase bg-cresc-100/50 px-2 py-1 rounded text-cresc-700">
                        {statusLabel}
                    </span>
                    {booking.remove_gel && !isCancelled && (
                        <span className="text-[10px] text-cresc-500 border border-cresc-200 px-1.5 py-0.5 rounded">
                            卸甲
                        </span>
                    )}
                </div>
                <div className="text-xs text-cresc-400 font-serif">
                   {format(parseISO(booking.created_at), 'yyyy/MM/dd')}
                </div>
             </div>

             <div className="flex items-center gap-4 mb-2">
                <div className="flex items-center gap-2 text-cresc-900 font-bold text-lg font-serif">
                    <Calendar size={18} className="text-cresc-500" />
                    {booking.booking_date}
                </div>
                <div className="flex items-center gap-2 text-cresc-800 font-medium">
                    <Clock size={16} className="text-cresc-400" />
                    {booking.booking_time}
                </div>
             </div>

             <div className="flex items-center gap-2 text-sm text-cresc-600 border-t border-cresc-100/50 pt-3 mt-1">
                <Sparkles size={14} />
                <span>{serviceLabel}</span>
             </div>
          </div>
        );
      })}
    </div>
  );
};
