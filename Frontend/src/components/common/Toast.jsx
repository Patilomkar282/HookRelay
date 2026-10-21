import React from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export const Toast = ({ message, type = 'success', onClose }) => {
  if (!message) return null;

  const isSuccess = type === 'success';

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div
        className={`flex items-center gap-2.5 px-4 py-3 rounded-md border shadow-sm text-sm font-medium ${
          isSuccess
            ? 'bg-white border-emerald-200 text-gray-900'
            : 'bg-white border-red-200 text-gray-900'
        }`}
        role="alert"
      >
        {isSuccess ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        ) : (
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
        )}
        <span className="text-xs sm:text-sm">{message}</span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-2 text-gray-400 hover:text-gray-600 p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
            aria-label="Close notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default Toast;
