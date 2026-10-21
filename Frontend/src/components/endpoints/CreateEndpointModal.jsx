import React, { useState } from 'react';
import { X, Shield, Check, Copy, AlertTriangle, Zap, CheckCircle2 } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';

const PROVIDER_OPTIONS = [
  {
    id: 'custom',
    name: 'Custom Webhook',
    desc: 'Standard JSON webhooks from internal services or custom webhooks',
    tag: 'Generic',
    color: 'border-gray-200 bg-gray-50/50',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    desc: 'Stripe-Signature verification with t=, v1= tokens',
    tag: 'Payment',
    color: 'border-indigo-100 bg-indigo-50/30',
  },
  {
    id: 'github',
    name: 'GitHub',
    desc: 'X-Hub-Signature-256 and X-GitHub-Delivery headers',
    tag: 'Developer',
    color: 'border-slate-200 bg-slate-50/50',
  },
  {
    id: 'razorpay',
    name: 'Razorpay',
    desc: 'X-Razorpay-Signature HMAC verification',
    tag: 'Payment',
    color: 'border-blue-100 bg-blue-50/30',
  },
];

export const CreateEndpointModal = ({ isOpen, onClose, onSubmit, isLoading }) => {
  const [targetUrl, setTargetUrl] = useState('');
  const [providerType, setProviderType] = useState('custom');
  const [error, setError] = useState('');
  const [createdEndpoint, setCreatedEndpoint] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setCreatedEndpoint(null);
    setTargetUrl('');
    setProviderType('custom');
    setError('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setError('Destination target URL is required');
      return;
    }

    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setError('URL must start with http:// or https://');
        return;
      }
    } catch {
      setError('Please enter a valid URL (e.g. https://api.my-domain.com/webhooks)');
      return;
    }

    try {
      const res = await onSubmit({ target_url: trimmed, provider_type: providerType });
      if (res && res.signing_secret) {
        setCreatedEndpoint(res);
      } else {
        handleClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to create mailbox endpoint');
    }
  };

  const baseUrl = window.location.origin.includes('5173')
    ? 'http://localhost:8000'
    : window.location.origin;

  // VIEW 2: Show Secret Once Modal View
  if (createdEndpoint) {
    const ingestUrl = `${baseUrl}/h/${createdEndpoint.slug}`;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-xs animate-in fade-in duration-150">
        <div
          className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-lg w-full overflow-hidden text-left p-6 space-y-5"
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Mailbox Created Successfully
              </h3>
              <p className="text-xs text-gray-500">
                Your dedicated endpoint is ready to receive incoming webhooks.
              </p>
            </div>
          </div>

          {/* Show Secret Once Warning Banner */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-xs text-amber-900 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-amber-950">
                Save Your Signing Secret Now (Shown Once)
              </span>
              <span>
                For security reasons, this signing secret will <strong>never be shown in full again</strong>. Copy it now and paste it into your webhook provider settings (GitHub, Stripe, etc.).
              </span>
            </div>
          </div>

          {/* Public Ingest URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-600" />
              Public Ingest Mailbox URL (POST)
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={ingestUrl}
                className="flex-1 h-9 px-3 text-xs font-mono bg-gray-50 border border-gray-300 rounded-md focus:outline-none select-all text-gray-800"
              />
              <Button
                variant="secondary"
                size="sm"
                icon={copiedUrl ? Check : Copy}
                onClick={() => {
                  navigator.clipboard.writeText(ingestUrl);
                  setCopiedUrl(true);
                  setTimeout(() => setCopiedUrl(false), 2000);
                }}
              >
                {copiedUrl ? 'Copied' : 'Copy URL'}
              </Button>
            </div>
          </div>

          {/* HMAC Signing Secret */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              Signing Secret (HMAC-SHA256)
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={createdEndpoint.signing_secret}
                className="flex-1 h-9 px-3 text-xs font-mono bg-gray-50 border border-emerald-300 rounded-md focus:outline-none select-all text-gray-900 font-bold"
              />
              <Button
                variant="secondary"
                size="sm"
                icon={copiedSecret ? Check : Copy}
                onClick={() => {
                  navigator.clipboard.writeText(createdEndpoint.signing_secret);
                  setCopiedSecret(true);
                  setTimeout(() => setCopiedSecret(false), 2000);
                }}
              >
                {copiedSecret ? 'Copied' : 'Copy Secret'}
              </Button>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-2 border-t border-gray-100 flex items-center justify-end">
            <Button variant="primary" size="md" onClick={handleClose}>
              I Have Saved My Secret — Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // VIEW 1: Create Endpoint Form
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-lg w-full overflow-hidden text-left"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Create Webhook Mailbox</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Generates a unique public ingest URL and signing secret.
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div>
            <Input
              label="Destination Target URL"
              id="target-url-input"
              type="text"
              required
              placeholder="https://api.your-app.com/api/webhooks"
              value={targetUrl}
              onChange={(e) => {
                setTargetUrl(e.target.value);
                if (error) setError('');
              }}
              helperText="The internal or production URL where captured webhooks will be forwarded."
            />
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-700">
              Webhook Provider Preset
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PROVIDER_OPTIONS.map((opt) => {
                const isSelected = providerType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setProviderType(opt.id)}
                    className={`p-3 rounded-lg border text-left transition-all relative ${
                      isSelected
                        ? 'border-gray-900 bg-gray-900 text-white shadow-xs'
                        : `${opt.color} hover:border-gray-300 text-gray-800`
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs">{opt.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          isSelected
                            ? 'bg-gray-800 text-gray-200'
                            : 'bg-white/80 text-gray-600 border border-gray-200'
                        }`}
                      >
                        {opt.tag}
                      </span>
                    </div>
                    <p
                      className={`text-[11px] leading-snug line-clamp-2 ${
                        isSelected ? 'text-gray-300' : 'text-gray-500'
                      }`}
                    >
                      {opt.desc}
                    </p>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-emerald-400 absolute bottom-2 right-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs text-indigo-900 space-y-1">
            <span className="font-semibold flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              What happens upon creation:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-indigo-700 text-[11px] pl-1">
              <li>Generates a secure 22-character random mailbox slug (<code className="font-mono">/h/&#123;slug&#125;</code>)</li>
              <li>Generates an HMAC secret (<code className="font-mono">whsec_...</code>) for signature verification</li>
              <li>Configures 2MB payload protection and idempotency caching</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <Button variant="secondary" size="md" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" isLoading={isLoading}>
              Create Mailbox
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEndpointModal;
