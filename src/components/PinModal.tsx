
import React, { useState } from 'react';
import { Lock, Unlock, KeyRound, X } from 'lucide-react';
import { MotionButton } from './MotionButton';

interface PinModalProps {
  onVerify: (pin: string) => Promise<boolean>;
  onSuccess: (pin: string) => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

export const PinModal: React.FC<PinModalProps> = ({ 
  onVerify,
  onSuccess, 
  onCancel, 
  title = "ยืนยันรหัส PIN", 
  description = "กรุณากรอกรหัส PIN เพื่อดำเนินการต่อ" 
}) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pin.trim();
    if (!cleanPin) {
      setError(true);
      setErrorMessage('กรุณาระบุรหัส PIN');
      setTimeout(() => setError(false), 800);
      return;
    }
    if (isVerifying) return;
    
    setIsVerifying(true);
    const isValid = await onVerify(cleanPin);
    setIsVerifying(false);

    if (isValid) {
      onSuccess(cleanPin);
    } else {
      setError(true);
      setErrorMessage('รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
      setPin('');
      setTimeout(() => setError(false), 1200);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={`bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl border ${error ? 'border-red-500 animate-shake' : 'border-slate-200 dark:border-slate-700'} w-full max-w-md text-center transform transition-all duration-200 scale-100 relative overflow-hidden`}>
        {/* Decorative background element */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl"></div>
        
        <div className="flex justify-end mb-2 relative z-10">
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/40 rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-inner rotate-3 hover:rotate-0 transition-transform duration-500 relative z-10">
          <div className="p-2.5 sm:p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
            <Lock className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        
        <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white mb-2 tracking-tight relative z-10">{title}</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6 sm:mb-8 text-xs sm:text-sm relative z-10">
          {description}
        </p>

        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          <div className="relative group">
            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type={showPin ? "text" : "password"}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoFocus
              className={`w-full bg-slate-50 dark:bg-slate-900/50 border-2 ${error ? 'border-red-500' : 'border-slate-100 dark:border-slate-700'} rounded-3xl pl-12 pr-12 py-4 text-center text-2xl font-black tracking-[0.5em] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-300 dark:placeholder:text-slate-700`}
            />
            <button 
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 transition-colors p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
            >
              {showPin ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </button>
          </div>

          {errorMessage && (
            <p className="text-red-500 text-xs font-bold animate-in fade-in duration-150">
              {errorMessage}
            </p>
          )}
          
          <div className="flex gap-4">
            <MotionButton 
              type="button"
              onClick={onCancel}
              className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold py-4 rounded-2xl transition-all"
            >
              ยกเลิก
            </MotionButton>
            <MotionButton 
              type="submit"
              disabled={isVerifying}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/30 transition-all disabled:opacity-50"
            >
              {isVerifying ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}
            </MotionButton>
          </div>
        </form>
      </div>
      
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
      `}</style>
    </div>
  );
};
