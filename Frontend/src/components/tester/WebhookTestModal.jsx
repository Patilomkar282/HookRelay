import React, { useState } from 'react';
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
} from 'lucide-react';

const PRESETS = {
  stripe: {
    name: 'Stripe (payment_intent.succeeded)',
    headers: {
      'User-Agent': 'Stripe/1.0',
      'Stripe-Signature': 't=1729505400,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd',
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
    headers: {
      'User-Agent': 'GitHub-Hookshot/1.0',
      'X-GitHub-Event': 'push',
      'X-GitHub-Delivery': `gh-deliv-${Date.now()}`,
    },
    body: {
      ref: 'refs/heads/main',
      repository: {
        name: 'hookrelay-core',
        full_name: 'acme/hookrelay-core',
        owner: { login: 'octocat' },
      },
      commits: [
        {
          id: 'b69f65809804b4097f48cb9ffbf6623c21c7a40b',
          message: 'feat: add resilient webhook dispatcher',
          author: { name: 'Alice Developer', email: 'alice@hookrelay.dev' },
        },
      ],
    },
  },
  razorpay: {
    name: 'Razorpay (payment.captured)',
    headers: {
      'User-Agent': 'Razorpay-Webhook/1.0',
      'X-Razorpay-Signature': 'rzp_sig_a89bc213fe',
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
  custom: {
    name: 'Custom JSON',
    headers: {
      'User-Agent': 'CustomClient/1.0',
      'X-Custom-Header': 'HookRelayTest',
    },
    body: {
      action: 'order.created',
      order_id: 'ord_987654',
      items_count: 3,
      total_cents: 8900,
      timestamp: new Date().toISOString(),
    },
  },
};

export const WebhookTestModal = ({
  isOpen,
  onClose,
  endpoint,
  onInspectEvent,
}) => {
  const queryClient = useQueryClient();
  const [selectedPreset, setSelectedPreset] = useState('stripe');
  const [headersText, setHeadersText] = useState(
    JSON.stringify(PRESETS.stripe.headers, null, 2)
  );
  const [bodyText, setBodyText] = useState(
    JSON.stringify(PRESETS.stripe.body, null, 2)
  );
  const [activeTab, setActiveTab] = useState('body'); // 'body' | 'headers'
  const [isLoading, setIsLoading] = useState(false);
  const [responseResult, setResponseResult] = useState(null);
  const [jsonError, setJsonError] = useState('');

  if (!isOpen || !endpoint) return null;

  const handleSelectPreset = (key) => {
    setSelectedPreset(key);
    const p = PRESETS[key];
    setHeadersText(JSON.stringify(p.headers, null, 2));
    setBodyText(JSON.stringify(p.body, null, 2));
    setResponseResult(null);
    setJsonError('');
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
      // Browsers forbid setting unsafe headers like 'User-Agent', 'Referer', etc. via XMLHttpRequest/fetch.
      // Filter them out to prevent browser console errors when testing from UI.
      const FORBIDDEN_BROWSER_HEADERS = [
        'user-agent',
        'referer',
        'host',
        'origin',
        'cookie',
      ];
      const safeHeaders = {};
      for (const [key, val] of Object.entries(parsedHeaders)) {
        if (!FORBIDDEN_BROWSER_HEADERS.includes(key.toLowerCase())) {
          safeHeaders[key] = val;
        }
      }

      const res = await sendIngestWebhook(endpoint.slug, parsedBody, safeHeaders);
      setResponseResult({
        success: true,
        status: 202,
        data: res,
      });
      // Invalidate queries so lists update immediately
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
        className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-left"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-indigo-600 text-white flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Interactive Webhook Simulator
              </h3>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                Target: POST /h/{endpoint.slug}
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

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Preset Buttons */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Select Payload Preset
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(PRESETS).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleSelectPreset(k)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border text-center transition-all ${
                    selectedPreset === k
                      ? 'border-gray-900 bg-gray-900 text-white shadow-xs'
                      : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  {k.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Tabs for Body vs Headers */}
          <div>
            <div className="flex items-center justify-between border-b border-gray-200 pb-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('body')}
                  className={`px-3 py-1 text-xs font-semibold rounded-t-md transition-colors ${
                    activeTab === 'body'
                      ? 'text-gray-900 border-b-2 border-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Payload Body (JSON)
                </button>
                <button
                  onClick={() => setActiveTab('headers')}
                  className={`px-3 py-1 text-xs font-semibold rounded-t-md transition-colors ${
                    activeTab === 'headers'
                      ? 'text-gray-900 border-b-2 border-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Headers (JSON)
                </button>
              </div>
              <span className="text-[11px] text-gray-400 font-mono">
                Editable Payload
              </span>
            </div>

            {/* Error banner */}
            {jsonError && (
              <div className="mt-2 p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{jsonError}</span>
              </div>
            )}

            {/* Editors */}
            <div className="mt-2">
              {activeTab === 'body' ? (
                <textarea
                  rows={8}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="w-full p-3 font-mono text-xs bg-gray-950 text-emerald-400 rounded-lg border border-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed"
                  placeholder="Enter JSON body..."
                />
              ) : (
                <textarea
                  rows={8}
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                  className="w-full p-3 font-mono text-xs bg-gray-950 text-indigo-300 rounded-lg border border-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed"
                  placeholder="Enter JSON headers..."
                />
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
                      ? 'HTTP 202 Accepted — Event Stored'
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
                        variant="secondary"
                        size="sm"
                        icon={ExternalLink}
                        onClick={() => {
                          onClose();
                          onInspectEvent?.(responseResult.data.event_id);
                        }}
                      >
                        Inspect Captured Event
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
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
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
