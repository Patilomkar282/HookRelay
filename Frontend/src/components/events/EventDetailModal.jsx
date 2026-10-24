import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchEventDetail, fetchEventDeliveries, replayEvent } from '../../api/client';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Logo from '../common/Logo';
import {
  X,
  Copy,
  Check,
  Code,
  List,
  Terminal,
  Clock,
  Key,
  Truck,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

export const EventDetailModal = ({ eventId, onClose }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('deliveries'); // 'deliveries' | 'body' | 'headers' | 'replay'
  const [copied, setCopied] = useState(false);
  const [headerFilter, setHeaderFilter] = useState('');
  const [replaySuccessMsg, setReplaySuccessMsg] = useState('');

  // 1. Fetch Event Detail
  const {
    data: event,
    isLoading: loadingEvent,
    isError: isEventError,
    error: eventError,
  } = useQuery({
    queryKey: ['eventDetail', eventId],
    queryFn: () => fetchEventDetail(eventId),
    enabled: !!eventId,
  });

  // 2. Fetch Deliveries
  const {
    data: deliveries = [],
    isLoading: loadingDeliveries,
    refetch: refetchDeliveries,
  } = useQuery({
    queryKey: ['eventDeliveries', eventId],
    queryFn: () => fetchEventDeliveries(eventId),
    enabled: !!eventId,
    refetchInterval: 3000,
  });

  // 3. Replay Mutation
  const replayMutation = useMutation({
    mutationFn: () => replayEvent(eventId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['eventDeliveries', eventId] });
      queryClient.invalidateQueries({ queryKey: ['endpointEvents'] });
      setReplaySuccessMsg(`Replayed! Status: ${data.status}`);
      setTimeout(() => setReplaySuccessMsg(''), 4000);
    },
  });

  if (!eventId) return null;

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedBody = event?.body
    ? JSON.stringify(event.body, null, 2)
    : '{}';

  // Construct replay curl command
  const replayBaseUrl = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.origin.includes('5173') ? 'http://localhost:8000' : (typeof window !== 'undefined' ? window.location.origin : 'https://api.hookrelay.dev'));
  const curlCommand = event
    ? `curl -X POST "${replayBaseUrl}/events/replay" \\\n` +
      Object.entries(event.headers || {})
        .filter(([k]) => !['host', 'content-length'].includes(k.toLowerCase()))
        .map(([k, v]) => `  -H "${k}: ${v}" \\`)
        .join('\n') +
      `\n  -H "Content-Type: application/json" \\\n` +
      `  -d '${JSON.stringify(event.body)}'`
    : '';

  const headersList = Object.entries(event?.headers || {}).filter(([k, v]) =>
    k.toLowerCase().includes(headerFilter.toLowerCase()) ||
    String(v).toLowerCase().includes(headerFilter.toLowerCase())
  );

  // Check if signature header was provided
  const normHeaders = Object.keys(event?.headers || {}).map((k) => k.toLowerCase());
  const hasSignatureHeader =
    normHeaders.includes('x-hub-signature-256') ||
    normHeaders.includes('x-hub-signature') ||
    normHeaders.includes('x-signature-sha256') ||
    normHeaders.includes('x-webhook-signature') ||
    normHeaders.includes('stripe-signature');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-left"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <Logo size="md" showText={false} className="h-8 w-8 rounded-lg shadow-2xs" />
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-semibold text-gray-900">Event & Delivery Inspector</h3>
                {event && (
                  <Badge
                    status={
                      event.signature_valid
                        ? 'delivered'
                        : hasSignatureHeader
                        ? 'failed'
                        : 'pending'
                    }
                    label={
                      event.signature_valid
                        ? 'Signature Valid (HMAC-SHA256)'
                        : hasSignatureHeader
                        ? 'Invalid Signature'
                        : 'Unsigned / Generic'
                    }
                  />
                )}
              </div>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                ID: {eventId}
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

        {/* Content Body */}
        {loadingEvent ? (
          <div className="p-16 text-center text-xs text-gray-500">
            Fetching event and delivery state...
          </div>
        ) : isEventError ? (
          <div className="p-8 text-center text-xs text-red-600">
            {eventError?.message || 'Failed to load event details'}
          </div>
        ) : event ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Meta bar */}
            <div className="px-6 py-3 bg-white border-b border-gray-100 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-600">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  {new Date(event.received_at).toLocaleString()}
                </span>
                {event.idempotency_key && (
                  <span className="flex items-center gap-1 font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    <Key className="w-3 h-3" />
                    {event.idempotency_key}
                  </span>
                )}
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('deliveries')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                    activeTab === 'deliveries'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Deliveries ({deliveries.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('body')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                    activeTab === 'body'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>Payload Body</span>
                </button>
                <button
                  onClick={() => setActiveTab('headers')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                    activeTab === 'headers'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Headers ({Object.keys(event.headers || {}).length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('replay')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                    activeTab === 'replay'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>cURL Command</span>
                </button>
              </div>
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Deliveries Tab */}
              {activeTab === 'deliveries' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-gray-100">
                    <div>
                      <span className="text-xs font-semibold text-gray-900 block">
                        Webhook Forwarding Engine
                      </span>
                      <span className="text-[11px] text-gray-500">
                        Dispatches to destination with 10s timeout and exponential backoff retry schedule.
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        icon={RotateCw}
                        isLoading={replayMutation.isPending}
                        onClick={() => replayMutation.mutate()}
                      >
                        Replay Event
                      </Button>
                    </div>
                  </div>

                  {replaySuccessMsg && (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{replaySuccessMsg}</span>
                    </div>
                  )}

                  {loadingDeliveries ? (
                    <div className="p-8 text-center text-xs text-gray-500">
                      Loading delivery attempts...
                    </div>
                  ) : deliveries.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-500 border border-dashed rounded-lg">
                      No delivery record created for this event yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {deliveries.map((del, idx) => {
                        const isDelivered = del.status === 'delivered';
                        const isRetrying = del.status === 'retrying';
                        const isFailed = del.status === 'failed';

                        return (
                          <div
                            key={del.id}
                            className={`p-4 rounded-xl border transition-all ${
                              isDelivered
                                ? 'bg-emerald-50/40 border-emerald-200'
                                : isFailed
                                ? 'bg-red-50/40 border-red-200'
                                : isRetrying
                                ? 'bg-amber-50/40 border-amber-200'
                                : 'bg-gray-50/60 border-gray-200'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-current/10">
                              <div className="flex items-center gap-2">
                                <Badge
                                  status={
                                    isDelivered
                                      ? 'delivered'
                                      : isFailed
                                      ? 'failed'
                                      : isRetrying
                                      ? 'retrying'
                                      : 'pending'
                                  }
                                  label={del.status.toUpperCase()}
                                />
                                <span className="text-xs font-mono font-medium text-gray-700">
                                  Attempt {del.attempt_count} of 5
                                </span>
                              </div>

                              <div className="flex items-center gap-3 text-xs text-gray-500 font-mono">
                                {del.latency_ms !== null && del.latency_ms !== undefined && (
                                  <span className="font-semibold text-gray-700">
                                    {del.latency_ms}ms
                                  </span>
                                )}
                                {del.last_status_code && (
                                  <span
                                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                      isDelivered
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}
                                  >
                                    HTTP {del.last_status_code}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="pt-3 space-y-2 text-xs">
                              {del.last_error && (
                                <div className="p-2.5 rounded-md bg-white/80 border border-red-200 text-red-700 font-mono text-[11px] break-all">
                                  <span className="font-bold">Error:</span> {del.last_error}
                                </div>
                              )}

                              <div className="flex flex-wrap items-center justify-between gap-2 text-gray-500 text-[11px]">
                                <span>
                                  Created: {new Date(del.created_at).toLocaleTimeString()}
                                </span>
                                {del.next_attempt_at && (
                                  <span className="font-medium text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded">
                                    Next retry scheduled: {new Date(del.next_attempt_at).toLocaleTimeString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Payload Body Tab */}
              {activeTab === 'body' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">
                      Decoded JSON Body
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCopy(formattedBody)}
                      icon={copied ? Check : Copy}
                    >
                      {copied ? 'Copied' : 'Copy JSON'}
                    </Button>
                  </div>
                  <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg text-xs font-mono leading-relaxed overflow-x-auto max-h-[400px]">
                    <code>{formattedBody}</code>
                  </pre>
                </div>
              )}

              {/* Headers Tab */}
              {activeTab === 'headers' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <input
                      type="text"
                      placeholder="Search headers..."
                      value={headerFilter}
                      onChange={(e) => setHeaderFilter(e.target.value)}
                      className="h-8 px-3 text-xs bg-gray-50 border border-gray-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-gray-900 max-w-xs"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        handleCopy(JSON.stringify(event.headers, null, 2))
                      }
                      icon={copied ? Check : Copy}
                    >
                      {copied ? 'Copied' : 'Copy All Headers'}
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-sans uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="px-4 py-2 font-medium w-1/3">Header Name</th>
                          <th className="px-4 py-2 font-medium">Header Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {headersList.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-4 py-6 text-center text-gray-400">
                              No matching headers found
                            </td>
                          </tr>
                        ) : (
                          headersList.map(([k, v]) => (
                            <tr key={k} className="hover:bg-gray-50/50">
                              <td className="px-4 py-2 font-semibold text-gray-800 break-all">
                                {k}
                              </td>
                              <td className="px-4 py-2 text-gray-600 break-all select-all">
                                {String(v)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* cURL Replay Tab */}
              {activeTab === 'replay' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-gray-700 block">
                        Replay cURL Snippet
                      </span>
                      <span className="text-[11px] text-gray-500">
                        Run this in your terminal to reproduce this exact webhook payload.
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCopy(curlCommand)}
                      icon={copied ? Check : Copy}
                    >
                      {copied ? 'Copied' : 'Copy cURL'}
                    </Button>
                  </div>
                  <pre className="p-4 bg-gray-900 text-emerald-400 rounded-lg text-xs font-mono leading-relaxed overflow-x-auto max-h-[400px]">
                    <code>{curlCommand}</code>
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span className="font-mono">
                Endpoint ID: {event.endpoint_id}
              </span>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default EventDetailModal;
