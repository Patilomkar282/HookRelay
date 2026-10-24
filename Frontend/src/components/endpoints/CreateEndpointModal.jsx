import React, { useState } from 'react';
import {
  X,
  Shield,
  Check,
  Copy,
  AlertTriangle,
  Zap,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Key,
  Sliders,
  Sparkles,
} from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import Logo from '../common/Logo';

const PROVIDER_OPTIONS = [
  {
    id: 'custom',
    name: 'Custom Webhook',
    desc: 'Standard JSON webhooks from internal services or custom applications',
    tag: 'Custom',
    defaultHeader: 'X-Webhook-Signature',
    color: 'border-gray-200 bg-gray-50/50',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    desc: 'HMAC-SHA256 verification via X-Shopify-Hmac-Sha256 base64 token',
    tag: 'E-Commerce',
    defaultHeader: 'X-Shopify-Hmac-Sha256',
    color: 'border-emerald-100 bg-emerald-50/30',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    desc: 'Stripe-Signature verification with t=, v1= tokens',
    tag: 'Payment',
    defaultHeader: 'Stripe-Signature',
    color: 'border-indigo-100 bg-indigo-50/30',
  },
  {
    id: 'github',
    name: 'GitHub',
    desc: 'X-Hub-Signature-256 and X-GitHub-Delivery headers',
    tag: 'Developer',
    defaultHeader: 'X-Hub-Signature-256',
    color: 'border-slate-200 bg-slate-50/50',
  },
  {
    id: 'razorpay',
    name: 'Razorpay',
    desc: 'X-Razorpay-Signature HMAC-SHA256 verification',
    tag: 'Payment',
    defaultHeader: 'X-Razorpay-Signature',
    color: 'border-blue-100 bg-blue-50/30',
  },
  {
    id: 'slack',
    name: 'Slack / Twilio',
    desc: 'Enterprise alerts, messaging bots, and telecommunication dispatches',
    tag: 'Messaging',
    defaultHeader: 'X-Twilio-Signature',
    color: 'border-amber-100 bg-amber-50/30',
  },
];

export const CreateEndpointModal = ({ isOpen, onClose, onSubmit, isLoading }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [providerType, setProviderType] = useState('custom');
  const [customProviderName, setCustomProviderName] = useState('');
  const [customSignatureHeader, setCustomSignatureHeader] = useState('');
  const [secretMode, setSecretMode] = useState('auto'); // 'auto' | 'custom'
  const [customSecret, setCustomSecret] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');
  const [createdEndpoint, setCreatedEndpoint] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setCreatedEndpoint(null);
    setName('');
    setDescription('');
    setTargetUrl('');
    setProviderType('custom');
    setCustomProviderName('');
    setCustomSignatureHeader('');
    setSecretMode('auto');
    setCustomSecret('');
    setShowAdvanced(false);
    setError('');
    onClose();
  };

  const handleProviderSelect = (optId) => {
    setProviderType(optId);
    const selected = PROVIDER_OPTIONS.find((p) => p.id === optId);
    if (selected && selected.defaultHeader && optId !== 'custom') {
      setCustomSignatureHeader(selected.defaultHeader);
    } else if (optId === 'custom') {
      setCustomSignatureHeader('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedTarget = targetUrl.trim();
    if (!trimmedTarget) {
      setError('Destination target URL is required');
      return;
    }

    try {
      const parsed = new URL(trimmedTarget);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setError('URL must start with http:// or https://');
        return;
      }
    } catch {
      setError('Please enter a valid URL (e.g. https://api.my-domain.com/webhooks)');
      return;
    }

    const payload = {
      name: name.trim() || null,
      description: description.trim() || null,
      target_url: trimmedTarget,
      provider_type:
        providerType === 'custom' && customProviderName.trim()
          ? customProviderName.trim().toLowerCase()
          : providerType,
      custom_signature_header: customSignatureHeader.trim() || null,
      signing_secret: secretMode === 'custom' && customSecret.trim() ? customSecret.trim() : null,
    };

    try {
      const res = await onSubmit(payload);
      if (res && res.signing_secret) {
        setCreatedEndpoint(res);
      } else {
        handleClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to create mailbox endpoint');
    }
  };

  const apiBase = import.meta.env.VITE_API_URL;
  const baseUrl = apiBase
    ? apiBase.replace(/\/+$/, '')
    : (window.location.origin.includes('5173') ? 'http://localhost:8000' : window.location.origin);

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
                {createdEndpoint.name ? createdEndpoint.name : 'Mailbox Created Successfully'}
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
              <span className="font-semibold block mb-0.5">Show Secret Once Policy</span>
              Copy and save your signing secret now. For security reasons, this signing secret will
              never be revealed again in plaintext.
            </div>
          </div>

          {/* Mailbox Details */}
          <div className="space-y-3">
            {/* Ingestion URL */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Public Ingestion URL (Webhook Destination)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={ingestUrl}
                  className="w-full text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-900 select-all focus:outline-none"
                />
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    navigator.clipboard.writeText(ingestUrl);
                    setCopiedUrl(true);
                    setTimeout(() => setCopiedUrl(false), 2000);
                  }}
                  icon={copiedUrl ? Check : Copy}
                >
                  {copiedUrl ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Signing Secret */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Webhook Signing Secret
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={createdEndpoint.signing_secret}
                  className="w-full text-xs font-mono bg-amber-50/50 border border-amber-200 rounded-lg p-2.5 text-amber-950 font-semibold select-all focus:outline-none"
                />
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    navigator.clipboard.writeText(createdEndpoint.signing_secret);
                    setCopiedSecret(true);
                    setTimeout(() => setCopiedSecret(false), 2000);
                  }}
                  icon={copiedSecret ? Check : Copy}
                >
                  {copiedSecret ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Target URL Info */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-1">
              <div className="text-gray-500 font-medium">Forwarding to:</div>
              <div className="font-mono text-gray-900 truncate select-all">
                {createdEndpoint.target_url}
              </div>
              <div className="text-[11px] text-gray-500 pt-1">
                Provider: <span className="font-semibold uppercase text-gray-800">{createdEndpoint.provider_type}</span>
                {createdEndpoint.custom_signature_header && (
                  <span className="ml-2">• Header: <span className="font-mono text-gray-700">{createdEndpoint.custom_signature_header}</span></span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex justify-end">
            <Button variant="primary" size="md" onClick={handleClose}>
              Done & Go to Mailbox
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
        className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden text-left"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <Logo size="md" showText={false} className="h-8 w-8 rounded-lg shadow-2xs" />
            <div>
              <h3 className="text-base font-semibold text-gray-900">Create Webhook Mailbox</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Set up a dedicated ingestion mailbox with custom branding, target URL, and cryptographic verification.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-md transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Mailbox Name / Label */}
          <div>
            <Input
              label="Mailbox Name / Friendly Label"
              id="mailbox-name-input"
              type="text"
              placeholder="e.g. Shopify Store Production, Slack Alerts, Internal Billing Hub"
              value={name}
              onChange={(e) => setName(e.target.value)}
              helperText="Give your mailbox a recognizable name to easily distinguish it."
            />
          </div>

          {/* Target Destination URL */}
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
              helperText="The internal or production URL where incoming webhooks will be forwarded."
            />
          </div>

          {/* Provider Preset Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-gray-700">
                Webhook Provider or Category
              </label>
              <span className="text-[11px] text-gray-400">Choose preset or custom</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PROVIDER_OPTIONS.map((opt) => {
                const isSelected = providerType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleProviderSelect(opt.id)}
                    className={`p-2.5 rounded-lg border text-left transition-all relative ${
                      isSelected
                        ? 'border-gray-900 bg-gray-900 text-white shadow-xs'
                        : `${opt.color} hover:border-gray-300 text-gray-800`
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold text-xs truncate">{opt.name}</span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />
                      )}
                    </div>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                        isSelected
                          ? 'bg-gray-800 text-gray-200'
                          : 'bg-white/80 text-gray-600 border border-gray-200'
                      }`}
                    >
                      {opt.tag}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* If Custom selected: allow specifying custom provider name */}
          {providerType === 'custom' && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2 animate-in fade-in duration-150">
              <Input
                label="Custom Provider Identifier (Optional)"
                id="custom-provider-input"
                type="text"
                placeholder="e.g. twilio, clerk, supabase, linear, hubspot"
                value={customProviderName}
                onChange={(e) => setCustomProviderName(e.target.value)}
                helperText="Custom identifier tag for filtering and analytics."
              />
            </div>
          )}

          {/* Collapsible Advanced Security & Secret Configuration */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-4 py-2.5 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-xs font-semibold text-gray-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                <span>Security & Custom Secret Settings</span>
              </div>
              <div className="flex items-center gap-1 text-gray-500 text-[11px]">
                <span>{showAdvanced ? 'Hide' : 'Configure secret & header'}</span>
                {showAdvanced ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </div>
            </button>

            {showAdvanced && (
              <div className="p-4 bg-white space-y-4 border-t border-gray-100 text-xs animate-in fade-in duration-150">
                {/* Custom Signature Header */}
                <div>
                  <Input
                    label="Custom Signature Header Name"
                    id="custom-header-input"
                    type="text"
                    placeholder="e.g. X-Shopify-Hmac-Sha256, X-Twilio-Signature, X-My-Signature"
                    value={customSignatureHeader}
                    onChange={(e) => setCustomSignatureHeader(e.target.value)}
                    helperText="Specify the exact HTTP header your provider sends the HMAC signature in."
                  />
                </div>

                {/* Signing Secret Mode */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-700">
                    Signing Secret Generation
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSecretMode('auto')}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        secretMode === 'auto'
                          ? 'border-indigo-600 bg-indigo-50/60 text-indigo-950 font-semibold'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Auto-generate Secret</span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-normal">
                        Generates a cryptographically strong <code className="font-mono">whsec_...</code>
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSecretMode('custom')}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        secretMode === 'custom'
                          ? 'border-indigo-600 bg-indigo-50/60 text-indigo-950 font-semibold'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Key className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Use Existing Secret</span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-normal">
                        Paste an existing secret from your provider
                      </p>
                    </button>
                  </div>
                </div>

                {/* Custom Secret Input */}
                {secretMode === 'custom' && (
                  <div className="animate-in fade-in duration-150">
                    <Input
                      label="Existing Provider Secret"
                      id="custom-secret-input"
                      type="text"
                      placeholder="e.g. shpss_12345abcdef... or your HMAC secret"
                      value={customSecret}
                      onChange={(e) => setCustomSecret(e.target.value)}
                      helperText="Incoming payloads will be validated against this secret."
                    />
                  </div>
                )}

                {/* Description / Team Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Team Notes / Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Used for fulfillment order notifications and inventory updates."
                    className="w-full text-xs bg-gray-50 border border-gray-300 rounded-md p-2 text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs text-indigo-900 space-y-1">
            <span className="font-semibold flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              Production Safeguards:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-indigo-700 text-[11px] pl-1">
              <li>Generates a secure 22-character random mailbox slug (<code className="font-mono">/h/&#123;slug&#125;</code>)</li>
              <li>Validates incoming signatures via constant-time cryptographic hash</li>
              <li>Guards against SSRF and enforces 120 req/min sliding-window rate limit</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 shrink-0">
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
