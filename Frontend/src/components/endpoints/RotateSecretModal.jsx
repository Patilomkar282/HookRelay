import React from 'react';
import { AlertTriangle, X, RefreshCw } from 'lucide-react';
import Button from '../common/Button';

export const RotateSecretModal = ({ isOpen, onClose, endpoint, onConfirm, isLoading }) => {
  if (!isOpen || !endpoint) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-md w-full overflow-hidden text-left"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h3 className="text-base font-semibold text-gray-900">Rotate Signing Secret</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-600 leading-relaxed">
            Are you sure you want to regenerate the signing secret for this mailbox?
          </p>

          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md font-mono text-xs text-gray-700 truncate">
            Current: {endpoint.signing_secret || 'None'}
          </div>

          <div className="p-3.5 rounded-lg bg-amber-50/80 border border-amber-200 text-xs text-amber-900">
            <span className="font-semibold block mb-0.5">Important Warning:</span>
            The old secret will become invalid immediately. Webhook signatures generated using the old secret will fail verification.
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
            <Button variant="secondary" size="md" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={RefreshCw}
              isLoading={isLoading}
              onClick={() => onConfirm(endpoint.id)}
            >
              Generate New Secret
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RotateSecretModal;
