import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sendIngestWebhook } from '../../api/client';
import Button from '../common/Button';
import Badge from '../common/Badge';
import {
  X,
  Send,
  CheckCircle2,
  AlertCircle,
  Code,
  Sliders,
  ExternalLink,
  Zap,
  Terminal,
  Copy,
  Check,
  ShieldCheck,
  Lock,
} from 'lucide-react';

// Cryptographic HMAC-SHA256 helpers via Web Crypto API (100% native in browser)
const computeHmacSha256Hex = async (secret, text) => {
  if (!secret) return '';
  const enc = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await window.crypto.subtle.sign('HMAC', key, enc.encode(text));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const computeHmacSha256Base64 = async (secret, text) => {
  if (!secret) return '';
  const enc = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await window.crypto.subtle.sign('HMAC', key, enc.encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

export const WebhookTestModal = ({
  isOpen,
  onClose,
  endpoint,
  onInspectEvent,
}) => {
  const queryClient = useQueryClient();

  // Determine initial preset based on endpoint provider
  const getInitialPresetKey = (ep) => {
    if (!ep) return 'custom';
    const p = (ep.provider_type || '').toLowerCase();
    if (['shopify', 'stripe', 'github', 'razorpay', 'slack'].includes(p)) {
      return p;
    }
    return 'custom';
  };

  const [selectedPreset, setSelectedPreset] = useState('custom');
  const [headersText, setHeadersText] = useState('{}');
  const [bodyText, setBodyText] = useState('{}');
  const [activeTab, setActiveTab] = useState('body'); // 'body' | 'headers' | 'cli'
  const [cliLang, setCliLang] = useState('powershell'); // 'powershell' | 'bash'
  const [autoSign, setAutoSign] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [responseResult, setResponseResult] = useState(null);
  const [jsonError, setJsonError] = useState('');
  const [copiedCli, setCopiedCli] = useState(false);

  // Build dynamic presets with endpoint metadata
  const presets = useMemo(() => {
    const slug = endpoint?.slug || 'sample-slug';
    const mailboxName = endpoint?.name || 'Custom Webhook Mailbox';
    const customHeader = endpoint?.custom_signature_header || 'X-Webhook-Signature';

    return {
      shopify: {
        name: 'Shopify (orders/create)',
        badge: 'E-Commerce',
        headers: {
          'X-Shopify-Topic': 'orders/create',
          'X-Shopify-Shop-Domain': 'acme-store.myshopify.com',
          'X-Shopify-Order-Id': '1029384756',
          'X-Shopify-Hmac-Sha256': '(auto-computed upon send)',
        },
        body: {
          id: 820982911946154508,
          email: 'buyer@customer-domain.com',
          created_at: new Date().toISOString(),
          total_price: '149.00',
          currency: 'USD',
          financial_status: 'paid',
          line_items: [
            {
              id: 1042,
              title: 'Pro Webhook Relay Subscription (Annual)',
              price: '149.00',
              quantity: 1,
            },
          ],
          customer: {
            first_name: 'John',
            last_name: 'Doe',
            email: 'john.doe@example.com',
          },
        },
      },
      stripe: {
        name: 'Stripe (payment_intent.succeeded)',
        badge: 'Payment',
        headers: {
          'Stripe-Signature': '(auto-computed upon send)',
          'Idempotency-Key': `idemp_stripe_${Date.now()}`,
        },
        body: {
          id: `evt_stripe_${Date.now()}`,
          object: 'event',
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'pi_3MtwBwLkdIwHu7ix28a3tqPa',
              amount: 4900,
              currency: 'usd',
              status: 'succeeded',
              customer: 'cus_N624dJ9aP6lU',
            },
          },
        },
      },
      github: {
        name: 'GitHub (push event)',
        badge: 'Developer',
        headers: {
          'X-GitHub-Event': 'push',
          'X-GitHub-Delivery': `gh-deliv-${Date.now()}`,
          'X-Hub-Signature-256': '(auto-computed upon send)',
        },
        body: {
          ref: 'refs/heads/main',
          repository: {
            name: 'hookrelay-core',
            full_name: 'acme/hookrelay-core',
            owner: { login: 'octocat' },
          },
          head_commit: {
            id: 'b69f65809804b4097f48cb9ffbf6623c21c7a40b',
            message: 'feat: add resilient webhook dispatcher',
            author: { name: 'Alice Developer', email: 'alice@hookrelay.dev' },
          },
        },
      },
      razorpay: {
        name: 'Razorpay (payment.captured)',
        badge: 'Payment',
        headers: {
          'X-Razorpay-Signature': '(auto-computed upon send)',
          'X-Razorpay-Event-Id': `rzp_evt_${Date.now()}`,
        },
        body: {
          entity: 'event',
          account_id: 'acc_E5m0D1L7dY2o1s',
          event: 'payment.captured',
          payload: {
            payment: {
              entity: {
                id: 'pay_H6f9Q0B2M8z1',
                amount: 250000,
                currency: 'INR',
                status: 'captured',
              },
            },
          },
        },
      },
      slack: {
        name: 'Slack / Twilio Event',
        badge: 'Messaging',
        headers: {
          'X-Slack-Signature': '(auto-computed upon send)',
          'X-Twilio-Signature': '(auto-computed upon send)',
        },
        body: {
          event: 'message.channels',
          channel: 'C1234567890',
          text: `Invoice payment confirmed for mailbox: ${mailboxName}`,
          user: 'U1234567890',
          timestamp: new Date().toISOString(),
        },
      },
      custom: {
        name: `${mailboxName} (Custom)`,
        badge: 'Custom',
        headers: {
          [customHeader]: '(auto-computed upon send)',
          'X-HookRelay-Source': 'simulator',
          'Idempotency-Key': `idemp_custom_${Date.now()}`,
        },
        body: {
          event: 'mailbox.custom_event',
          mailbox_slug: slug,
          mailbox_name: mailboxName,
          status: 'success',
          payload: {
            order_id: 'ord_987654',
            amount: 89.5,
            currency: 'USD',
            customer: 'client@company.com',
          },
          timestamp: new Date().toISOString(),
        },
      },
    };
  }, [endpoint]);

  // Synchronize preset on modal open or endpoint change
  useEffect(() => {
    if (isOpen && endpoint) {
      const initialKey = getInitialPresetKey(endpoint);
      setSelectedPreset(initialKey);
      const p = presets[initialKey] || presets.custom;
      setHeadersText(JSON.stringify(p.headers, null, 2));
      setBodyText(JSON.stringify(p.body, null, 2));
      setResponseResult(null);
      setJsonError('');
    }
  }, [isOpen, endpoint, presets]);

  if (!isOpen || !endpoint) return null;

  const handleSelectPreset = (key) => {
    setSelectedPreset(key);
    const p = presets[key] || presets.custom;
    setHeadersText(JSON.stringify(p.headers, null, 2));
    setBodyText(JSON.stringify(p.body, null, 2));
    setResponseResult(null);
    setJsonError('');
  };

  const apiBase = import.meta.env.VITE_API_URL;
  const baseUrl = apiBase
    ? apiBase.replace(/\/+$/, '')
    : (window.location.origin.includes('5173') ? 'http://localhost:8000' : window.location.origin);

  // Build generated CLI terminal snippets (PowerShell & Bash)
  const cliSnippet = useMemo(() => {
    const ingestUrl = `${baseUrl}/h/${endpoint.slug}`;
    const cleanBodyOneLine = bodyText.replace(/\s+/g, ' ').replace(/"/g, '\\"');

    if (cliLang === 'powershell') {
      return `curl.exe --% -X POST "${ingestUrl}" -H "Content-Type: application/json" -H "Idempotency-Key: idemp_${Date.now()}" -d "${cleanBodyOneLine}"`;
    }

    return `curl -X POST "${ingestUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: idemp_${Date.now()}" \\
  -d '${bodyText.replace(/'/g, "\\'")}'`;
  }, [baseUrl, endpoint.slug, bodyText, cliLang]);

  const handleCopyCli = () => {
    navigator.clipboard.writeText(cliSnippet);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  const handleSend = async () => {
    setJsonError('');
    setResponseResult(null);

    let parsedHeaders = {};
    let parsedBody = {};

    try {
      parsedHeaders = headersText ? JSON.parse(headersText) : {};
    } catch {
      setJsonError('Headers must be valid JSON');
      return;
    }

    try {
      parsedBody = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      setJsonError('Payload Body must be valid JSON');
      return;
    }

    setIsLoading(true);
    try {
      const rawBodyString = JSON.stringify(parsedBody);
      const secret = endpoint.signing_secret || '';

      // Prepare headers map
      const headersToSend = { ...parsedHeaders };

      // Compute Cryptographic Signatures if auto-sign is enabled and secret is available
      if (autoSign && secret) {
        const hexSig = await computeHmacSha256Hex(secret, rawBodyString);
        const b64Sig = await computeHmacSha256Base64(secret, rawBodyString);

        if (selectedPreset === 'shopify') {
          headersToSend['X-Shopify-Hmac-Sha256'] = b64Sig;
        } else if (selectedPreset === 'stripe') {
          const timestamp = Math.floor(Date.now() / 1000);
          const stripePayload = `${timestamp}.${rawBodyString}`;
          const stripeHex = await computeHmacSha256Hex(secret, stripePayload);
          headersToSend['Stripe-Signature'] = `t=${timestamp},v1=${stripeHex}`;
        } else if (selectedPreset === 'github') {
          headersToSend['X-Hub-Signature-256'] = `sha256=${hexSig}`;
        } else if (selectedPreset === 'razorpay') {
          headersToSend['X-Razorpay-Signature'] = hexSig;
        } else if (selectedPreset === 'slack') {
          headersToSend['X-Slack-Signature'] = `v0=${hexSig}`;
          headersToSend['X-Twilio-Signature'] = hexSig;
        } else {
          // Custom mailbox preset
          if (endpoint.custom_signature_header) {
            headersToSend[endpoint.custom_signature_header] = hexSig;
          }
          headersToSend['X-Webhook-Signature'] = hexSig;
        }
      }

      // Filter out browser-forbidden headers
      const FORBIDDEN_BROWSER_HEADERS = [
        'user-agent',
        'referer',
        'host',
        'origin',
        'cookie',
      ];
      const safeHeaders = {};
      for (const [key, val] of Object.entries(headersToSend)) {
        if (!FORBIDDEN_BROWSER_HEADERS.includes(key.toLowerCase())) {
          safeHeaders[key] = val;
        }
      }

      const res = await sendIngestWebhook(endpoint.slug, parsedBody, safeHeaders);
      setResponseResult({
        success: true,
        status: 202,
        data: res,
        appliedHeaders: safeHeaders,
      });

      // Invalidate queries so events list updates immediately
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      queryClient.invalidateQueries({ queryKey: ['endpointEvents'] });
    } catch (err) {
      setResponseResult({
        success: false,
        error: err.message || 'Failed to dispatch webhook',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden text-left"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900 tracking-tight">
                  {endpoint.name ? endpoint.name : 'Interactive Webhook Simulator'}
                </h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {endpoint.provider_type}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                Ingest: <span className="text-gray-800 font-semibold">POST /h/{endpoint.slug}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-md transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Preset Buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Select Payload Preset
              </label>
              <span className="text-[11px] text-gray-400">
                Tailored for {endpoint.provider_type}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {Object.entries(presets).map(([k, v]) => {
                const isSelected = selectedPreset === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleSelectPreset(k)}
                    className={`px-2.5 py-2 text-xs font-semibold rounded-lg border text-center transition-all ${
                      isSelected
                        ? 'border-gray-900 bg-gray-900 text-white shadow-xs'
                        : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className="truncate">{k.toUpperCase()}</div>
                    <div className={`text-[9px] font-normal font-mono truncate ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
                      {v.badge}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cryptographic Signing Bar */}
          <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-emerald-950">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span className="font-semibold block">Cryptographic HMAC-SHA256 Signing</span>
                <span className="text-[11px] text-emerald-800">
                  {autoSign
                    ? 'Payload will be dynamically signed using this mailbox secret for 100% verified status.'
                    : 'Simulation without secret signature (tests forged / unauthenticated rejection).'}
                </span>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={autoSign}
                onChange={(e) => setAutoSign(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Tabs for Body vs Headers vs CLI */}
          <div>
            <div className="flex items-center justify-between border-b border-gray-200 pb-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('body')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
                    activeTab === 'body'
                      ? 'text-gray-900 border-b-2 border-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Payload Body (JSON)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('headers')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
                    activeTab === 'headers'
                      ? 'text-gray-900 border-b-2 border-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Headers (JSON)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('cli')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors flex items-center gap-1.5 ${
                    activeTab === 'cli'
                      ? 'text-gray-900 border-b-2 border-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Terminal Command</span>
                </button>
              </div>
              <span className="text-[11px] text-gray-400 font-mono hidden sm:inline">
                {activeTab === 'cli' ? 'Windows & Bash CLI' : 'Editable Payload'}
              </span>
            </div>

            {/* Error banner */}
            {jsonError && (
              <div className="mt-2 p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{jsonError}</span>
              </div>
            )}

            {/* Editors & CLI Views */}
            <div className="mt-2">
              {activeTab === 'body' && (
                <textarea
                  rows={8}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="w-full p-3 font-mono text-xs bg-gray-950 text-emerald-400 rounded-lg border border-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed"
                  placeholder="Enter JSON body..."
                />
              )}

              {activeTab === 'headers' && (
                <textarea
                  rows={8}
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                  className="w-full p-3 font-mono text-xs bg-gray-950 text-indigo-300 rounded-lg border border-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed"
                  placeholder="Enter JSON headers..."
                />
              )}

              {activeTab === 'cli' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCliLang('powershell')}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          cliLang === 'powershell'
                            ? 'bg-gray-900 text-white font-semibold'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        Windows PowerShell (curl.exe)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCliLang('bash')}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          cliLang === 'bash'
                            ? 'bg-gray-900 text-white font-semibold'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        Bash / macOS / Linux cURL
                      </button>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleCopyCli}
                      icon={copiedCli ? Check : Copy}
                    >
                      {copiedCli ? 'Copied' : 'Copy Command'}
                    </Button>
                  </div>

                  <pre className="p-3.5 bg-gray-950 text-emerald-400 rounded-lg font-mono text-xs leading-relaxed overflow-x-auto select-all border border-gray-800">
                    <code>{cliSnippet}</code>
                  </pre>
                  <p className="text-[11px] text-gray-500">
                    Paste directly into your terminal to test webhook capture from external command-line tools.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Response Box */}
          {responseResult && (
            <div
              className={`p-4 rounded-lg border text-xs font-mono transition-all animate-in fade-in ${
                responseResult.success
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  : 'bg-red-50/70 border-red-200 text-red-950'
              }`}
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-current/10 font-sans">
                <div className="flex items-center gap-2">
                  {responseResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span className="font-semibold text-xs">
                    {responseResult.success
                      ? 'HTTP 202 Accepted — Captured & Stored in PostgreSQL'
                      : 'Request Failed'}
                  </span>
                </div>
                {responseResult.success && (
                  <Badge status="delivered" label="202 Accepted" />
                )}
              </div>

              {responseResult.success ? (
                <div className="space-y-2">
                  <pre className="overflow-x-auto text-[11px] leading-normal text-emerald-900">
                    {JSON.stringify(responseResult.data, null, 2)}
                  </pre>
                  {responseResult.data?.event_id && (
                    <div className="pt-2 flex justify-end font-sans">
                      <Button
                        variant="primary"
                        size="sm"
                        icon={ExternalLink}
                        onClick={() => {
                          onClose();
                          onInspectEvent?.(responseResult.data.event_id);
                        }}
                      >
                        Inspect Event Details & Status →
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-red-700">{responseResult.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
          <Button variant="secondary" size="md" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={Send}
            isLoading={isLoading}
            onClick={handleSend}
          >
            Send Ingest Webhook
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WebhookTestModal;
