import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore, startOfDay, addMonths, isSameMonth, getDate, addHours, setHours, setMinutes, isAfter } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { fetchAvailability } from '../services/mockApi';
import { DayAvailability, TimeSlot } from '../types';
import { ChevronLeft, ChevronRight, Loader2, Clock } from 'lucide-react';

interface BookingCalendarProps {
  onSelectSlot: (date: Date, slot: TimeSlot) => void;
  selectedDate: Date | null;
  selectedTime: TimeSlot | null;
}

export const BookingCalendar: React.FC<BookingCalendarProps> = ({ onSelectSlot, selectedDate, selectedTime }) => {
  const [currentViewDate, setCurrentViewDate] = useState(new Date());
  const [availability, setAvailability] = useState<Record<string, DayAvailability>>({});
  const [loading, setLoading] = useState(false);
  
  const [activeDateForSlots, setActiveDateForSlots] = useState<Date | null>(null);

  const today = new Date();
  const dayOfMonth = getDate(today);
  // Rule: Only open next month after 15th (Optional: You can remove this if you want full manual control)
  const showNextMonthAllowed = dayOfMonth >= 15;
  const bookingCutoff = addHours(today, 48); 
  
  const maxDate = showNextMonthAllowed ? endOfMonth(addMonths(today, 1)) : endOfMonth(today);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const year = currentViewDate.getFullYear();
      const month = currentViewDate.getMonth();
      
      const data = await fetchAvailability(year, month);
      const map: Record<string, DayAvailability> = {};
      data.forEach(d => map[d.date] = d);
      
      setAvailability(prev => ({ ...prev, ...map }));
      setLoading(false);
    };
    loadData();
  }, [currentViewDate]);

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentViewDate),
    end: endOfMonth(currentViewDate),
  });

  const startDayOfWeek = getDay(startOfMonth(currentViewDate)); 

  const handlePrevMonth = () => {
    const prev = addMonths(currentViewDate, -1);
    if (!isBefore(endOfMonth(prev), startOfDay(today))) {
        setCurrentViewDate(prev);
    }
  };

  const handleNextMonth = () => {
    const next = addMonths(currentViewDate, 1);
    if (isBefore(startOfMonth(next), maxDate) || isSameMonth(startOfMonth(next), maxDate)) {
        setCurrentViewDate(next);
    }
  };
  
  const isPrevDisabled = isSameMonth(currentViewDate, today);
  const isNextDisabled = !showNextMonthAllowed || isSameMonth(currentViewDate, maxDate);

  const checkSlotTime = (date: Date, timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotDate = setMinutes(setHours(date, hours), minutes);
    return isAfter(slotDate, bookingCutoff);
  };

  const handleDateClick = (day: Date, isDisabled: boolean) => {
    if (isDisabled) return;
    
    if (activeDateForSlots && isSameMonth(day, activeDateForSlots) && getDate(day) === getDate(activeDateForSlots)) {
        // Toggle off if clicking same day? Optional. Keep open for now.
    } else {
        setActiveDateForSlots(day);
        onSelectSlot(day, null as any); 
    }
  };

  const handleSlotClick = (day: Date, slot: TimeSlot) => {
    onSelectSlot(day, slot);
    setActiveDateForSlots(null); 
  };

  const renderDay = (day: Date) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    const dayData = availability[dateKey];
    
    const isPast = isBefore(day, startOfDay(today));
    
    let hasBookableSlot = false;
    if (dayData && dayData.availableSlots) {
        hasBookableSlot = dayData.availableSlots.some(slot => checkSlotTime(day, slot));
    }

    // New logic: Only disable if no configuration or no remaining valid slots
    const isConfigured = dayData?.totalSlots > 0;
    const isDisabled = isPast || !dayData || !isConfigured || !hasBookableSlot;
    
    const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === dateKey;
    const isActive = activeDateForSlots && format(activeDateForSlots, 'yyyy-MM-dd') === dateKey;

    // Visual indicator for "Fully Booked" vs "Closed"
    // If isConfigured is true but hasBookableSlot is false => Fully Booked (Red dot?)
    // For now we keep it simple: gray is disabled.

    return (
      <div key={dateKey} className="flex flex-col items-center mb-2 relative">
        <button
          onClick={() => handleDateClick(day, isDisabled)}
          disabled={isDisabled}
          className={`
            w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200
            ${(isSelected || isActive) ? 'bg-cresc-800 text-white shadow-md scale-105' : ''}
            ${!isSelected && !isActive && !isDisabled ? 'hover:bg-cresc-200 text-cresc-900 cursor-pointer' : ''}
            ${isDisabled ? 'text-gray-300 cursor-not-allowed' : ''}
          `}
        >
          {format(day, 'd')}
        </button>
        {isSelected && !isActive && (
            <div className="w-1 h-1 bg-cresc-800 rounded-full mt-1"></div>
        )}
      </div>
    );
  };

  const emptyDays = Array(startDayOfWeek).fill(null);
  const activeDayKey = activeDateForSlots ? format(activeDateForSlots, 'yyyy-MM-dd') : null;
  const activeDayData = activeDayKey ? availability[activeDayKey] : null;

  return (
    <div className="w-full max-w-md mx-auto bg-white p-6 rounded-xl shadow-sm border border-cresc-100">
      <div className="text-center mb-6">
         <h3 className="text-cresc-800 text-lg font-bold tracking-widest">
            預約日期
         </h3>
         <p className="text-xs text-cresc-500 mt-1">[ 請選擇有開放預約的日期 ]</p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <button onClick={handlePrevMonth} disabled={isPrevDisabled} className="p-1 disabled:opacity-30 hover:bg-cresc-50 rounded-full text-cresc-800">
            <ChevronLeft size={24} />
        </button>
        <span className="text-lg font-serif font-medium text-cresc-900">
            {format(currentViewDate, 'yyyy年 M月', { locale: zhTW })}
        </span>
        <button onClick={handleNextMonth} disabled={isNextDisabled} className="p-1 disabled:opacity-30 hover:bg-cresc-50 rounded-full text-cresc-800">
            <ChevronRight size={24} />
        </button>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-cresc-400">
            <Loader2 className="animate-spin" />
        </div>
      ) : (
        <>
            <div className="grid grid-cols-7 gap-1 text-center mb-4">
                {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                    <div key={d} className="text-xs text-cresc-400 font-bold mb-2">{d}</div>
                ))}
                
                {emptyDays.map((_, i) => <div key={`empty-${i}`} />)}
                {daysInMonth.map(day => renderDay(day))}
            </div>

            <div className={`transition-all duration-300 overflow-hidden ${activeDateForSlots ? 'max-h-56 opacity-100 mt-4 border-t border-cresc-100 pt-4' : 'max-h-0 opacity-0'}`}>
                {activeDateForSlots && activeDayData && (
                    <div className="text-center animate-in fade-in slide-in-from-top-2">
                        <p className="text-sm text-cresc-600 mb-3 font-medium">
                            {format(activeDateForSlots, 'M月d日')} 可預約時段
                        </p>
                        <div className="flex flex-wrap justify-center gap-3">
                            {activeDayData.availableSlots.length > 0 ? (
                                activeDayData.availableSlots.map((slot) => {
                                    const isSlotTimeValid = checkSlotTime(activeDateForSlots, slot);
                                    
                                    return (
                                        <button
                                            key={slot}
                                            disabled={!isSlotTimeValid}
                                            onClick={() => handleSlotClick(activeDateForSlots, slot as TimeSlot)}
                                            className={`
                                                px-4 py-2 text-sm rounded border transition-colors
                                                ${selectedTime === slot 
                                                    ? 'bg-cresc-600 text-white border-cresc-600' 
                                                    : isSlotTimeValid
                                                        ? 'border-cresc-200 text-cresc-800 hover:bg-cresc-50 hover:border-cresc-400' 
                                                        : 'bg-gray-50 text-gray-300 border-transparent cursor-not-allowed hidden'} 
                                            `}
                                        >
                                            {slot}
                                        </button>
                                    );
                                })
                            ) : (
                                <p className="text-xs text-gray-400">本日時段已額滿</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {!activeDateForSlots && selectedDate && selectedTime && (
                <div className="mt-4 pt-4 border-t border-cresc-100 text-center animate-in fade-in zoom-in-95">
                    <div className="inline-flex items-center gap-2 bg-cresc-50 px-4 py-2 rounded-lg text-cresc-800 border border-cresc-200">
                        <Clock size={16} />
                        <span className="text-sm font-bold tracking-wide">
                            已選擇：{format(selectedDate, 'yyyy-MM-dd')} {selectedTime}
                        </span>
                    </div>
                </div>
            )}
        </>
      )}
    </div>
  );
};
