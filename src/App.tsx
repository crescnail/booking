import React, { useState, useEffect } from 'react';
import { SectionHeader } from './components/SectionHeader';
import { BookingCalendar } from './components/BookingCalendar';
import { UserHistory } from './components/UserHistory';
import { TimeSlot, SERVICES, Booking } from './types';
import { CREATIVE_WARNING_DATA, MONTHLY_SPECIAL_NOTE, CLASSIC_SPECIAL_NOTE, REMOVAL_NOTE, TERMS_INFO, TERMS_RULES, LIFF_ID } from './constants';
import { submitBooking, getCustomerProfile, fetchUserBookings } from './services/mockApi';
import { AlertCircle, Check, ChevronDown, ChevronUp, Loader2, X, Info, FileText, History, User, Sparkles } from 'lucide-react';
import { format } from 'date-fns';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>('');
  const [memberCode, setMemberCode] = useState<string>(''); // 顯示用的會員編號
  const [lineDisplayName, setLineDisplayName] = useState<string>(''); // LINE 暱稱
  
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const [isReturningUser, setIsReturningUser] = useState(false); 
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // User History
  const [showHistory, setShowHistory] = useState(false);
  const [userBookings, setUserBookings] = useState<Booking[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Form State
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<TimeSlot | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceType, setServiceType] = useState<string>('');
  const [removeGel, setRemoveGel] = useState<boolean | null>(null);
  
  // Terms State
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Helper to generate a random 4-char code for new users
  const generateNewMemberCode = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Remove confusing I, 1, O, 0
      let result = '';
      for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return `CN-${result}`;
  };

  useEffect(() => {
    const init = async () => {
        let uid = '';
        let displayName = '';

        // 1. Try Initialize LIFF
        if (window.liff) {
            try {
                await window.liff.init({ liffId: LIFF_ID });
                if (window.liff.isLoggedIn()) {
                    const profile = await window.liff.getProfile();
                    uid = profile.userId;
                    displayName = profile.displayName;
                    setLineDisplayName(displayName);
                    console.log("LIFF Login Success:", uid, displayName);
                } else if (window.liff.isInClient()) {
                    // Force login if inside LINE app but somehow not logged in
                    await window.liff.login();
                }
            } catch (error) {
                console.warn("LIFF Init failed (normal if not in LINE):", error);
            }
        }

        // 2. Fallback to URL Query Parameter
        if (!uid) {
            const params = new URLSearchParams(window.location.search);
            uid = params.get('userId') || '';
        }
        
        // 3. Fallback to Session Storage (Persistent ID for Browser Testing)
        if (!uid) {
            const storedId = sessionStorage.getItem('cresc_user_id');
            if (storedId) {
                uid = storedId;
            } else {
                // Generate a mock LINE ID (starts with U) to satisfy format requirements
                const randomHex = Array.from({length: 30}, () => Math.floor(Math.random() * 16).toString(16)).join('');
                uid = `U${randomHex}`; // e.g. U1a2b3c...
                sessionStorage.setItem('cresc_user_id', uid);
                console.log("Generated New Session ID:", uid);
            }
        }

        setUserId(uid);

        try {
            // 4. Check Profile from DB
            const profile = await getCustomerProfile(uid);
            
            if (profile) {
                // 舊客：使用資料庫中的會員編號與姓名
                setIsReturningUser(true);
                setMemberCode(profile.member_code || generateNewMemberCode());
                
                if (profile.is_blacklisted) {
                    setIsBlacklisted(true);
                }
                // Auto-fill form from DB
                if (profile.name) setName(profile.name);
                if (profile.phone) setPhone(profile.phone);
            } else {
                // 新客
                setIsReturningUser(false);
                setMemberCode(generateNewMemberCode());
                
                // Auto-fill form with LINE Name if available
                if (displayName) {
                    setName(displayName);
                } else {
                    setName('');
                }
                setPhone('');
            }
        } catch (error) {
            console.error("Failed to check profile", error);
        } finally {
            setLoading(false);
        }
    };

    init();
  }, []);

  // Fetch history only when requested
  const handleShowHistory = async () => {
      if (!showHistory) {
          setLoadingHistory(true);
          try {
              const bookings = await fetchUserBookings(userId);
              setUserBookings(bookings);
          } finally {
              setLoadingHistory(false);
          }
      }
      setShowHistory(!showHistory);
  };

  const handleDateSelect = (date: Date, slot: TimeSlot) => {
    if (!slot) {
        setSelectedDate(date);
        setSelectedTime(null); 
    } else {
        setSelectedTime(slot);
        setTimeout(() => {
            document.getElementById('details-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 300);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val.length <= 10) {
        setPhone(val);
    }
  };

  const handlePreSubmit = () => {
    if (!name || phone.length !== 10 || !serviceType || removeGel === null || !agreedToTerms || !selectedDate || !selectedTime) return;
    setShowConfirmModal(true);
  };

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    setShowConfirmModal(false);
    
    const payload = {
        userId,
        memberCode,
        date: format(selectedDate!, 'yyyy-MM-dd'),
        time: selectedTime,
        name, // This will be LINE name if user didn't change it
        phone,
        serviceType,
        removeGel,
        lineDisplayName, // Pass this to API as well just in case
    };

    try {
        await submitBooking(payload);
        setSubmitted(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Refresh history
        fetchUserBookings(userId).then(setUserBookings);
    } catch (e) {
        alert("預約失敗，請稍後再試");
    } finally {
        setSubmitting(false);
    }
  };
  
  if (loading) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-cresc-50 text-cresc-800">
            <SectionHeader />
            <Loader2 className="animate-spin mt-4" size={32} />
        </div>
    );
  }

  if (isBlacklisted) {
    return (
        <div className="min-h-screen bg-cresc-50 p-4 flex flex-col items-center justify-center">
            <SectionHeader />
            <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md text-center border-t-4 border-red-800">
                <AlertCircle className="mx-auto text-red-800 mb-4" size={48} />
                <h2 className="text-xl font-bold text-gray-800 mb-4">無法受理預約</h2>
                <p className="text-gray-600 leading-relaxed">
                    經評估過往預約狀況後，目前暫無法受理您的預約，謝謝您的體諒。
                </p>
            </div>
        </div>
    );
  }

  if (submitted) {
    return (
        <div className="min-h-screen bg-cresc-50 p-4 flex flex-col items-center justify-center">
            <SectionHeader />
            <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md text-center border-t-4 border-cresc-600">
                <div className="w-16 h-16 bg-cresc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="text-cresc-600" size={32} />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">預約成功</h2>
                <p className="text-gray-600 mb-6 left">
                    感謝您的預約，我們已發送確認訊息至您的 LINE。
                </p>
                <div className="text-left bg-cresc-50 p-4 rounded-lg text-sm text-cresc-900 space-y-2">
                    <p><span className="font-bold">日期：</span>{selectedDate && format(selectedDate, 'yyyy-MM-dd')}</p>
                    <p><span className="font-bold">時間：</span>{selectedTime}</p>
                    <p><span className="font-bold">姓名：</span><span className="font-mono text-cresc-600">{name}</span></p>
                    <p><span className="font-bold">項目：</span>{SERVICES.find(s => s.id === serviceType)?.label}</p>
                </div>
                
                <button 
                   onClick={() => window.location.reload()} 
                   className="mt-6 text-sm text-cresc-600 underline hover:text-cresc-800"
                >
                    返回首頁
                </button>
            </div>
        </div>
    );
  }

  const isDetailsComplete = serviceType && name && phone.length === 10 && removeGel !== null;

  return (
    <div className="min-h-screen bg-cresc-50 pb-20 relative">
      <div className="max-w-2xl mx-auto px-4">
        <SectionHeader />

        {/* User Identity Indicator (Sync Status) */}
        <div className="flex justify-center mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className={`px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 border shadow-sm
                ${isReturningUser 
                    ? 'bg-white text-cresc-700 border-cresc-200' 
                    : 'bg-cresc-100/50 text-cresc-600 border-transparent'}
            `}>
                {isReturningUser ? (
                    <>
                        <Sparkles size={12} className="text-cresc-500" />
                        <span>歡迎回來，{name || '貴賓'}</span>
                    </>
                ) : (
                    <>
                        <User size={12} className="opacity-50" />
                        <span>{lineDisplayName ? `Hi, ${lineDisplayName}` : 'Hello, New Friend'}</span>
                    </>
                )}
                <span className="w-px h-3 bg-cresc-300 mx-1"></span>
                <span className="font-mono text-cresc-500">NO. {memberCode}</span>
            </div>
        </div>

        {/* Section 1: Intro */}
        <section className="mb-8 px-4">
          <div className="text-cresc-800 leading-loose font-normal text-sm tracking-wide bg-white/50 p-6 rounded-xl border border-cresc-100/50 backdrop-blur-sm shadow-sm">
             <p className="mb-4">歡迎來到 cresc.nail。<br/>
             工作室採預約制 ㅣ預約前 請詳閱預約須知與規範</p>
             <p className="mb-4">我們採一對一的專屬服務，讓您在舒適的環境中享受美甲時光。</p>
             <ul className="space-y-1 text-xs text-cresc-600">
             <li>▫️限女性顧客，恕不接待男性</li>
             <li>▫️不開放攜伴、寵物陪伴</li>
             <li>▫️僅提供 手部美甲，無足部、延甲服務</li>
             <li>▫️不接待病甲、皮膚疾病</li>
             <li className="pl-4 text-cresc-400">如灰指甲、嚴重指緣炎等，請先尋求醫生治療，如有任何疑問可先傳圖確認。</li>
             </ul>
             <p className="mt-4 text-xs font-medium text-cresc-700">為了讓您有充分的時間準備，預約日將為您保留15分鐘的緩衝時間。</p>
          </div>
        </section>

        {/* Section 2: Calendar */}
        <section className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <BookingCalendar 
                onSelectSlot={handleDateSelect} 
                selectedDate={selectedDate}
                selectedTime={selectedTime}
            />
        </section>

        {/* Section 3: Details */}
        <div className={`transition-all duration-700 ease-in-out ${selectedDate && selectedTime ? 'opacity-100 translate-y-0' : 'opacity-30 translate-y-4 pointer-events-none grayscale'}`}>
            <section id="details-section" className="mb-10 bg-white p-6 md:p-8 rounded-xl shadow-sm border border-cresc-100">
                <h3 className="text-xl font-bold text-cresc-800 mb-6 pb-2 border-b border-cresc-100">預約資料</h3>
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-cresc-700 mb-2">姓名</label>
                        <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-cresc-50 border border-cresc-200 rounded-md px-4 py-3 focus:outline-none focus:ring-1 focus:ring-cresc-400 focus:bg-white transition-colors text-cresc-900 placeholder:text-cresc-300"
                            placeholder="請輸入您的真實姓名"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-cresc-700 mb-2">電話</label>
                        <input 
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={phone}
                            onChange={handlePhoneChange}
                            maxLength={10}
                            className={`w-full bg-cresc-50 border rounded-md px-4 py-3 focus:outline-none focus:ring-1 focus:ring-cresc-400 focus:bg-white transition-colors text-cresc-900 placeholder:text-cresc-300
                                ${phone.length > 0 && phone.length < 10 ? 'border-red-300 focus:ring-red-300' : 'border-cresc-200'}
                            `}
                            placeholder="0912-345-678"
                        />
                        {phone.length > 0 && phone.length < 10 && (
                            <p className="text-xs text-red-500 mt-1 ml-1">請輸入完整 10 碼電話號碼</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-cresc-700 mb-3">預約項目</label>
                        <div className="relative">
                            <select
                                value={serviceType}
                                onChange={(e) => setServiceType(e.target.value)}
                                className={`w-full appearance-none bg-cresc-50 border border-cresc-200 rounded-md px-4 py-3 pr-10 focus:outline-none focus:ring-1 focus:ring-cresc-400 focus:bg-white transition-colors text-cresc-900
                                ${!serviceType ? 'text-cresc-400' : ''}`}
                            >
                                <option value="" disabled>請選擇服務項目</option>
                                {SERVICES.map(service => (
                                    <option key={service.id} value={service.id}>
                                        {service.label}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-cresc-500">
                                <ChevronDown size={20} />
                            </div>
                        </div>

                        <div className="mt-4 space-y-4">
                            {serviceType === 'monthly_special' && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <p className="text-xs text-cresc-600 bg-cresc-50 p-3 rounded border border-cresc-100 inline-block">
                                        💡 {MONTHLY_SPECIAL_NOTE}
                                    </p>
                                </div>
                            )}
                            
                            {serviceType === 'classic_special' && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <p className="text-xs text-cresc-600 bg-cresc-50 p-3 rounded border border-cresc-100 inline-block">
                                        💡 {CLASSIC_SPECIAL_NOTE}
                                    </p>
                                </div>
                            )}

                            {(serviceType === '6_finger_creative' || serviceType === '10_finger_creative') && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="text-xs text-gray-500 leading-relaxed bg-cresc-50 p-5 rounded border border-cresc-200">
                                        <p className="mb-3">{CREATIVE_WARNING_DATA.intro}</p>
                                        <div className="font-bold text-cresc-700 mb-1">{CREATIVE_WARNING_DATA.sectionTitle}</div>
                                        <p className="mb-2">{CREATIVE_WARNING_DATA.sectionSubtitle}</p>
                                        <ul className="list-disc pl-4 space-y-1 marker:text-cresc-400">
                                            {CREATIVE_WARNING_DATA.items.map((item, index) => (
                                                <li key={index}>{item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-cresc-700 mb-3">是否需要卸甲</label>
                        <div className="flex gap-4">
                            <label className={`flex-1 text-center border rounded-lg p-3 cursor-pointer transition-all ${removeGel === true ? 'bg-cresc-600 border-cresc-600 text-white font-bold shadow-md' : 'border-cresc-200 text-gray-600 hover:bg-cresc-50'}`}>
                                <input type="radio" name="removeGel" className="hidden" onChange={() => setRemoveGel(true)} checked={removeGel === true} />
                                是
                            </label>
                            <label className={`flex-1 text-center border rounded-lg p-3 cursor-pointer transition-all ${removeGel === false ? 'bg-cresc-600 border-cresc-600 text-white font-bold shadow-md' : 'border-cresc-200 text-gray-600 hover:bg-cresc-50'}`}>
                                <input type="radio" name="removeGel" className="hidden" onChange={() => setRemoveGel(false)} checked={removeGel === false} />
                                否
                            </label>
                        </div>
                        <ul className="mt-3 ml-1 space-y-1">
                            {REMOVAL_NOTE.map((note, i) => (
                                <li key={i} className="text-xs text-gray-400 list-disc ml-4 marker:text-gray-300">
                                    {note}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>
        </div>

        {/* Section 4: Rules & Submit */}
        <div className={`transition-all duration-700 delay-100 ease-in-out ${isDetailsComplete ? 'opacity-100 translate-y-0' : 'opacity-30 translate-y-4 pointer-events-none grayscale'}`}>
            <section className="bg-white rounded-xl shadow-sm border border-cresc-100 overflow-hidden mb-8">
                <button 
                    onClick={() => setIsInfoOpen(!isInfoOpen)}
                    className="w-full flex items-center justify-between p-4 bg-cresc-50/50 hover:bg-cresc-50 transition-colors border-b border-cresc-100"
                >
                    <span className="font-bold text-cresc-800 flex items-center gap-2">
                        <Info size={18} className="text-cresc-600"/>
                        預約須知
                    </span>
                    {isInfoOpen ? <ChevronUp size={20} className="text-cresc-500"/> : <ChevronDown size={20} className="text-cresc-500"/>}
                </button>
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isInfoOpen ? 'max-h-[500px]' : 'max-h-0'}`}>
                    <div className="p-6 text-sm text-gray-600 leading-loose whitespace-pre-line bg-white overflow-y-auto max-h-[60vh]">
                        {TERMS_INFO.trim()}
                    </div>
                </div>

                <button 
                    onClick={() => setIsRulesOpen(!isRulesOpen)}
                    className="w-full flex items-center justify-between p-4 bg-cresc-50/50 hover:bg-cresc-50 transition-colors border-t border-cresc-100"
                >
                    <span className="font-bold text-cresc-800 flex items-center gap-2">
                        <FileText size={18} className="text-cresc-600"/>
                        預約規範
                    </span>
                    {isRulesOpen ? <ChevronUp size={20} className="text-cresc-500"/> : <ChevronDown size={20} className="text-cresc-500"/>}
                </button>
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isRulesOpen ? 'max-h-[500px]' : 'max-h-0'}`}>
                    <div className="p-6 text-sm text-gray-600 leading-loose whitespace-pre-line bg-white border-t border-cresc-100 overflow-y-auto max-h-[60vh]">
                        {TERMS_RULES.trim()}
                    </div>
                </div>
            </section>

            <div className="mb-8">
                <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-cresc-50 transition-colors">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${agreedToTerms ? 'bg-cresc-600 border-cresc-600' : 'border-gray-300 bg-white'}`}>
                        {agreedToTerms && <Check size={14} className="text-white" />}
                    </div>
                    <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={agreedToTerms} 
                        onChange={(e) => setAgreedToTerms(e.target.checked)} 
                    />
                    <span className="text-sm text-gray-700 font-medium">我已詳閱並同意上述預約需知與規範</span>
                </label>
            </div>

            <div className="fixed bottom-0 left-0 w-full bg-white border-t border-cresc-100 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40">
                <div className="max-w-2xl mx-auto">
                    <button
                        onClick={handlePreSubmit}
                        disabled={submitting || !agreedToTerms}
                        className={`w-full py-4 rounded-lg font-bold text-lg tracking-widest transition-all
                            ${submitting || !agreedToTerms 
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                                : 'bg-cresc-800 text-white hover:bg-cresc-900 shadow-lg shadow-cresc-200'
                            }
                        `}
                    >
                        {submitting ? (
                            <span className="flex items-center justify-center gap-2">
                                <Loader2 className="animate-spin" /> 處理中...
                            </span>
                        ) : '預約 BOOKING'}
                    </button>
                </div>
            </div>
            
            <div className="h-16"></div>
        </div>

        {/* Section 5: My History */}
        <section className="mb-12 mt-8 border-t border-cresc-100 pt-8">
            <button 
                onClick={handleShowHistory}
                className="w-full flex items-center justify-center gap-2 text-cresc-500 hover:text-cresc-800 transition-colors py-2"
            >
                {showHistory ? <ChevronUp size={16}/> : <History size={16} />}
                <span className="text-sm font-bold tracking-wider">我的預約紀錄</span>
            </button>
            
            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${showHistory ? 'max-h-[800px] opacity-100 mt-6' : 'max-h-0 opacity-0'}`}>
                <div className="bg-white/50 rounded-xl p-4 border border-cresc-100/50">
                    <div className="flex items-center gap-2 mb-4 text-xs text-cresc-400 pl-1">
                        <div className="flex items-center gap-1.5 bg-cresc-100/50 px-2 py-1 rounded">
                            <span className="font-mono font-bold text-cresc-600">NO. {memberCode}</span>
                        </div>
                        {lineDisplayName && (
                            <div className="flex items-center gap-1">
                                <span className="text-cresc-300">|</span>
                                <User size={12} />
                                <span>{lineDisplayName}</span>
                            </div>
                        )}
                        <span className="ml-auto bg-cresc-100 px-2 py-0.5 rounded text-cresc-600">{userBookings.length} 次預約</span>
                    </div>
                    <UserHistory bookings={userBookings} loading={loadingHistory} />
                </div>
            </div>
        </section>

      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-cresc-900/40 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)}></div>
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-cresc-50 p-4 border-b border-cresc-100 flex justify-between items-center">
                    <h3 className="font-bold text-cresc-800 text-lg">確認預約資訊</h3>
                    <button onClick={() => setShowConfirmModal(false)} className="text-cresc-500 hover:text-cresc-800">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 space-y-4 text-sm text-cresc-800">
                    <p className="text-center text-xs text-cresc-500 mb-2">請確認以下資訊無誤後送出</p>
                    <div className="space-y-3 bg-cresc-50/50 p-4 rounded-lg border border-cresc-100">
                        <div className="flex justify-between border-b border-cresc-100 pb-2">
                            <span className="text-cresc-500">預約時間</span>
                            <span className="font-bold">{selectedDate && format(selectedDate, 'yyyy-MM-dd')} | {selectedTime}</span>
                        </div>
                        <div className="flex justify-between border-b border-cresc-100 pb-2">
                            <span className="text-cresc-500">姓名</span>
                            <span className="font-bold">{name}</span>
                        </div>
                        <div className="flex justify-between border-b border-cresc-100 pb-2">
                            <span className="text-cresc-500">電話</span>
                            <span className="font-bold">{phone}</span>
                        </div>
                        <div className="flex justify-between border-b border-cresc-100 pb-2">
                            <span className="text-cresc-500">項目</span>
                            <span className="font-bold">{SERVICES.find(s => s.id === serviceType)?.label}</span>
                        </div>
                        <div className="flex justify-between border-b border-cresc-100 pb-2">
                            <span className="text-cresc-500">會員編號</span>
                            <span className="font-bold font-mono text-cresc-700">{memberCode}</span>
                        </div>
                        <div className="flex justify-between pb-1">
                            <span className="text-cresc-500">卸甲</span>
                            <span className="font-bold">{removeGel ? '是' : '否'}</span>
                        </div>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-cresc-500 mt-2">
                         <Check size={14} className="mt-0.5 text-cresc-600 shrink-0" />
                         <span>已詳閱並同意預約需知與規範</span>
                    </div>
                </div>

                <div className="p-4 border-t border-cresc-100 flex gap-3">
                    <button 
                        onClick={() => setShowConfirmModal(false)}
                        className="flex-1 py-3 text-cresc-600 font-bold hover:bg-cresc-50 rounded-lg transition-colors border border-transparent hover:border-cresc-200"
                    >
                        返回修改
                    </button>
                    <button 
                        onClick={handleFinalSubmit}
                        disabled={submitting}
                        className="flex-1 py-3 bg-cresc-800 text-white font-bold rounded-lg shadow-md hover:bg-cresc-900 transition-all"
                    >
                        {submitting ? <Loader2 className="animate-spin mx-auto" /> : '確認送出'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Dev Helper removed */}
    </div>
  );
}
