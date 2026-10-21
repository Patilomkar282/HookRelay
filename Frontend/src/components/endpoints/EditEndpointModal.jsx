import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';

export const EditEndpointModal = ({ isOpen, onClose, endpoint, onSubmit, isLoading }) => {
  const [targetUrl, setTargetUrl] = useState('');
  const [providerType, setProviderType] = useState('custom');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (endpoint) {
      setTargetUrl(endpoint.target_url || '');
      setProviderType(endpoint.provider_type || 'custom');
      setIsActive(endpoint.is_active ?? true);
      setError('');
    }
  }, [endpoint]);

  if (!isOpen || !endpoint) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setError('Destination target URL cannot be empty');
      return;
    }

    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setError('URL must start with http:// or https://');
        return;
      }
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    try {
      await onSubmit(endpoint.id, {
        target_url: trimmed,
        provider_type: providerType,
        is_active: isActive,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update endpoint');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-md w-full overflow-hidden text-left"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Edit Webhook Mailbox</h3>
            <p className="text-xs text-gray-500 font-mono mt-0.5 truncate max-w-xs">
              slug: {endpoint.slug}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <Input
            label="Destination Target URL"
            type="text"
            required
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            helperText="Where inbound webhooks will be dispatched."
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Provider Type
            </label>
            <select
              value={providerType}
              onChange={(e) => setProviderType(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-white border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="custom">Custom Webhook</option>
              <option value="stripe">Stripe</option>
              <option value="github">GitHub</option>
              <option value="razorpay">Razorpay</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div>
              <span className="text-xs font-semibold text-gray-900 block">
                Mailbox Active Status
              </span>
              <span className="text-[11px] text-gray-500">
                {isActive ? 'Accepting inbound webhook events' : 'Paused (ingest will return 404)'}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
            <Button variant="secondary" size="md" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" isLoading={isLoading}>
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditEndpointModal;
