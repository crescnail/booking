import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore, startOfDay, addMonths, isSameMonth, getDate, addHours, setHours, setMinutes, isAfter } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { fetchAvailability } from '../services/mockApi';
import { DayAvailability, TimeSlot } from '../types';
import { ChevronLeft, ChevronRight, Loader2, Clock, AlertTriangle } from 'lucide-react';

interface BookingCalendarProps {
  onSelectSlot: (date: Date, slot: TimeSlot) => void;
  selectedDate: Date | null;
  selectedTime: TimeSlot | null;
}

export const BookingCalendar: React.FC<BookingCalendarProps> = ({ onSelectSlot, selectedDate, selectedTime }) => {
  const [currentViewDate, setCurrentViewDate] = useState(new Date());
  const [availability, setAvailability] = useState<Record<string, DayAvailability>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [activeDateForSlots, setActiveDateForSlots] = useState<Date | null>(null);

  const today = new Date();
  const dayOfMonth = getDate(today);
  const showNextMonthAllowed = dayOfMonth >= 15;
  const bookingCutoff = addHours(today, 48); 
  
  const maxDate = showNextMonthAllowed ? endOfMonth(addMonths(today, 1)) : endOfMonth(today);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      const year = currentViewDate.getFullYear();
      const month = currentViewDate.getMonth();
      
      try {
        const data = await fetchAvailability(year, month);
        const map: Record<string, DayAvailability> = {};
        data.forEach(d => map[d.date] = d);
        setAvailability(prev => ({ ...prev, ...map }));
      } catch (err: any) {
        console.error("Failed to load calendar data", err);
        setError("無法載入排班表，請稍後再試");
      } finally {
        setLoading(false);
      }
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
        // Optional: Toggle off if clicking the same day
        // setActiveDateForSlots(null);
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
    
    // 檢查當天是否還有「未過期」且「未被預約」的時段
    let hasBookableSlot = false;
    if (dayData && dayData.availableSlots) {
        hasBookableSlot = dayData.availableSlots.some(slot => checkSlotTime(day, slot));
    }

    // 狀態判定
    const isConfigured = dayData?.totalSlots > 0; // 資料庫有設定這天
    const isRestDay = !isPast && !isConfigured;   // 沒設定 = 休
    const isFull = !isPast && isConfigured && !hasBookableSlot; // 有設定但沒空位 = 滿
    
    const isDisabled = isPast || isRestDay || isFull;
    
    const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === dateKey;
    const isActive = activeDateForSlots && format(activeDateForSlots, 'yyyy-MM-dd') === dateKey;

    return (
      <div key={dateKey} className="flex flex-col items-center mb-2 relative h-12 justify-start">
        <button
          onClick={() => handleDateClick(day, isDisabled)}
          disabled={isDisabled}
          className={`
            w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 z-10
            ${(isSelected || isActive) 
                ? 'bg-cresc-800 text-white shadow-lg scale-105' 
                : ''}
            ${!isSelected && !isActive && !isDisabled 
                ? 'hover:bg-cresc-100 text-cresc-900 cursor-pointer hover:shadow-sm' 
                : ''}
            ${isDisabled 
                ? 'text-gray-300 cursor-default bg-transparent' 
                : ''}
          `}
        >
          {format(day, 'd')}
        </button>
        
        {/* Indicators */}
        {isSelected && !isActive && (
            <div className="w-1 h-1 bg-cresc-800 rounded-full mt-1 animate-pulse"></div>
        )}
        
        {/* Status Text - Elegant & Minimal */}
        {isRestDay && (
            <span className="text-xs text-gray-300 font-light mt-[-2px] font-brand italic tracking-wider select-none">-</span>
        )}
        {isFull && (
            <span className="text-xs text-red-300 font-light mt-[-2px] tracking font-brand italic select-none">Fully</span>
        )}
      </div>
    );
  };

  const emptyDays = Array(startDayOfWeek).fill(null);
  const activeDayKey = activeDateForSlots ? format(activeDateForSlots, 'yyyy-MM-dd') : null;
  const activeDayData = activeDayKey ? availability[activeDayKey] : null;

  if (error) {
      return (
          <div className="w-full max-w-md mx-auto bg-white p-6 rounded-xl shadow-sm border border-red-100 text-center">
              <AlertTriangle className="mx-auto text-red-400 mb-2" size={24} />
              <p className="text-sm text-gray-500">{error}</p>
          </div>
      );
  }

  return (
    <div className="w-full max-w-md mx-auto bg-white p-6 rounded-xl shadow-sm border border-cresc-100">
      <div className="text-center mb-6">
         <h3 className="text-cresc-800 text-lg font-bold tracking-[0.1em] font-brand italic">
            DATE SELECTION
         </h3>
         <div className="w-8 h-0.5 bg-cresc-100 mx-auto mt-2 rounded-full"></div>
      </div>

      <div className="flex items-center justify-between mb-6 px-2">
        <button onClick={handlePrevMonth} disabled={isPrevDisabled} className="p-2 disabled:opacity-20 hover:bg-cresc-50 rounded-full text-cresc-800 transition-colors">
            <ChevronLeft size={20} />
        </button>
        <span className="text-lg font-serif font-medium text-cresc-900 tracking-wide">
            {format(currentViewDate, 'yyyy / MM', { locale: zhTW })}
        </span>
        <button onClick={handleNextMonth} disabled={isNextDisabled} className="p-2 disabled:opacity-20 hover:bg-cresc-50 rounded-full text-cresc-800 transition-colors">
            <ChevronRight size={20} />
        </button>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-cresc-400">
            <Loader2 className="animate-spin" />
        </div>
      ) : (
        <>
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                    <div key={d} className="text-[10px] text-cresc-400 font-bold mb-3 tracking-widest">{d}</div>
                ))}
                
                {emptyDays.map((_, i) => <div key={`empty-${i}`} />)}
                {daysInMonth.map(day => renderDay(day))}
            </div>

            <div className={`transition-all duration-500 overflow-hidden ease-out ${activeDateForSlots ? 'max-h-64 opacity-100 mt-4 border-t border-cresc-100 pt-6' : 'max-h-0 opacity-0'}`}>
                {activeDateForSlots && activeDayData && (
                    <div className="text-center animate-in fade-in slide-in-from-top-2">
                        <p className="text-sm text-cresc-800 mb-4 font-bold tracking-wider">
                            {format(activeDateForSlots, 'MM.dd')} TIME SLOTS
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
                                                px-5 py-2 text-sm rounded transition-all duration-300
                                                ${selectedTime === slot 
                                                    ? 'bg-cresc-800 text-white shadow-md transform scale-105' 
                                                    : isSlotTimeValid
                                                        ? 'border border-cresc-200 text-cresc-800 hover:bg-cresc-50 hover:border-cresc-400 bg-white' 
                                                        : 'hidden'} 
                                            `}
                                        >
                                            {slot}
                                        </button>
                                    );
                                })
                            ) : (
                                <p className="text-xs text-gray-400 italic">No slots available</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {!activeDateForSlots && selectedDate && selectedTime && (
                <div className="mt-4 pt-6 border-t border-cresc-100 text-center animate-in fade-in zoom-in-95 duration-500">
                    <div className="inline-flex flex-col items-center gap-1">
                        <span className="text-[10px] text-cresc-400 tracking-widest uppercase">Selected</span>
                        <div className="flex items-center gap-2 text-cresc-800 bg-cresc-50 px-4 py-2 rounded border border-cresc-100">
                            <Clock size={14} className="text-cresc-500" />
                            <span className="text-sm font-bold tracking-wide">
                                {format(selectedDate, 'yyyy-MM-dd')} <span className="mx-1 text-cresc-300">|</span> {selectedTime}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
      )}
    </div>
  );
};
