import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchEndpoints,
  fetchEndpointEvents,
  replayEvent,
  replayFailedDeliveries,
} from '../../api/client';
import Button from '../common/Button';
import Badge from '../common/Badge';
import EmptyState from '../common/EmptyState';
import Toast from '../common/Toast';
import EventDetailModal from './EventDetailModal';
import { useEventWebSocket } from '../../context/WebSocketContext';
import {
  Inbox,
  RotateCw,
  Search,
  Key,
  Clock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  Send,
  Radio,
  FileCode,
  RefreshCw,
  Filter,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';

export const EventsView = ({
  initialEndpointId = null,
  onOpenTestModal,
}) => {
  const queryClient = useQueryClient();
  const { isConnected, lastEvent } = useEventWebSocket();
  const [userSelectedId, setUserSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'failed' | 'retrying' | 'delivered' | 'pending'
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [inspectingEventId, setInspectingEventId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 1. Fetch user's endpoints to populate selector
  const { data: endpoints = [], isLoading: loadingEndpoints } = useQuery({
    queryKey: ['endpoints'],
    queryFn: fetchEndpoints,
  });

  // Derived selected endpoint ID
  const selectedEndpointId =
    userSelectedId ||
    initialEndpointId ||
    (endpoints.length > 0 ? endpoints[0].id : null);

  // 2. Fetch paginated events for the selected endpoint (with optional status filter)
  const {
    data: eventsPage,
    isLoading: loadingEvents,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['endpointEvents', selectedEndpointId, limit, offset, statusFilter],
    queryFn: () =>
      fetchEndpointEvents(selectedEndpointId, {
        limit,
        offset,
        status: statusFilter !== 'all' ? statusFilter : null,
      }),
    enabled: !!selectedEndpointId,
    refetchInterval: autoRefresh ? 4000 : false,
  });

  const selectedEndpoint = endpoints.find((e) => e.id === selectedEndpointId);

  // Replay mutations
  const replaySingleMutation = useMutation({
    mutationFn: (eventId) => replayEvent(eventId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpointEvents'] });
      queryClient.invalidateQueries({ queryKey: ['eventDeliveries'] });
      showToast(`Replayed event! Status: ${data.status}`);
    },
    onError: (err) => showToast(err.message, 'error'),
  });

  const replayFailedMutation = useMutation({
    mutationFn: () => replayFailedDeliveries(selectedEndpointId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpointEvents'] });
      refetch();
      showToast(data.message || `Replayed ${data.replayed_count} failed deliveries`);
    },
    onError: (err) => showToast(err.message, 'error'),
  });

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const items = eventsPage?.items || [];
  const total = eventsPage?.total || 0;

  // Filter items in current page by search term (id or idempotency_key)
  const filteredItems = items.filter((evt) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      evt.id.toLowerCase().includes(q) ||
      (evt.idempotency_key && evt.idempotency_key.toLowerCase().includes(q))
    );
  });

  const isTrulyEmpty =
    (!selectedEndpoint?.events_count || selectedEndpoint.events_count === 0) &&
    total === 0 &&
    statusFilter === 'all' &&
    !search;

  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.floor(offset / limit) + 1;

  const handlePrevPage = () => {
    setOffset((prev) => Math.max(0, prev - limit));
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset((prev) => prev + limit);
    }
  };

  const formatRelativeTime = (timestamp) => {
    try {
      const diffMs = Date.now() - new Date(timestamp).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return new Date(timestamp).toLocaleDateString();
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Toast Alert */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header controls: Endpoint selector, Live Monitor, Refresh, Replay Failed */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Endpoint Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <label className="text-xs font-semibold text-gray-700 shrink-0">
            Select Mailbox:
          </label>
          <select
            value={selectedEndpointId || ''}
            onChange={(e) => {
              setUserSelectedId(e.target.value);
              setOffset(0);
            }}
            disabled={loadingEndpoints || endpoints.length === 0}
            className="h-9 px-3 text-xs bg-gray-50 border border-gray-300 rounded-md font-mono text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 max-w-md w-full"
          >
            {endpoints.length === 0 ? (
              <option value="">No mailboxes created yet</option>
            ) : (
              endpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name ? `${ep.name} (/h/${ep.slug})` : `/h/${ep.slug}`} ({ep.provider_type}) — {ep.events_count || 0} events
                </option>
              ))
            )}
          </select>
        </div>

        {/* Right: Auto-refresh switch, Refetch, Test */}
        <div className="flex items-center gap-3">
          {/* Live Indicator Switch */}
          <div className="flex items-center gap-2 pr-3 border-r border-gray-200">
            <span
              className={`w-2 h-2 rounded-full ${
                autoRefresh ? 'bg-emerald-500 animate-ping' : 'bg-gray-400'
              }`}
            />
            <label className="text-xs text-gray-600 font-medium cursor-pointer select-none flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <span>Live Monitoring</span>
            </label>
          </div>

          <Button
            variant="secondary"
            size="sm"
            icon={RotateCw}
            onClick={() => refetch()}
            isLoading={isRefetching}
            title="Refresh events list"
          >
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {selectedEndpoint && (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                isLoading={replayFailedMutation.isPending}
                onClick={() => replayFailedMutation.mutate()}
                title="Bulk replay all failed webhook deliveries for this mailbox"
              >
                Replay Failed
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Send}
                onClick={() => onOpenTestModal?.(selectedEndpoint)}
              >
                Test Ingest
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Events Container */}
      {!selectedEndpointId ? (
        <EmptyState
          icon={Radio}
          title="No Mailbox Selected"
          description="Create or select a webhook mailbox to inspect captured events."
        />
      ) : loadingEvents && !eventsPage ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-xs text-gray-500">
          Loading webhook events...
        </div>
      ) : isTrulyEmpty ? (
        <EmptyState
          icon={Inbox}
          title="No Webhook Events Captured Yet"
          description={`Mailbox /h/${selectedEndpoint?.slug} is ready and waiting for incoming HTTP POST payloads.`}
          actionLabel="Send Test Webhook"
          onAction={() => onOpenTestModal?.(selectedEndpoint)}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden space-y-0">
          {/* Filter Bar */}
          <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by event ID or idempotency key..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 pl-9 pr-3 text-xs bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {/* Status Filter Dropdown */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white border border-gray-300 rounded-md px-2.5 h-8">
                  <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setOffset(0);
                    }}
                    className="text-xs bg-transparent border-0 focus:outline-none text-gray-800 font-medium cursor-pointer"
                  >
                    <option value="all">All Deliveries</option>
                    <option value="failed">Failed Only</option>
                    <option value="retrying">Retrying Only</option>
                    <option value="delivered">Delivered (200 OK)</option>
                    <option value="pending">Queued / Pending</option>
                  </select>
                </div>

                {/* Quick Toggle for Failed */}
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter((prev) => (prev === 'failed' ? 'all' : 'failed'));
                    setOffset(0);
                  }}
                  className={`h-8 px-2.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1 ${
                    statusFilter === 'failed'
                      ? 'bg-red-50 text-red-700 border-red-300 font-semibold shadow-2xs'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <AlertCircle className="w-3 h-3 text-red-500" />
                  <span>Failed Only</span>
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-500 font-medium shrink-0">
              Total Captured:{' '}
              <span className="font-semibold text-gray-900">{total}</span>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="py-16 px-4 text-center space-y-3">
              <div className="w-10 h-10 mx-auto rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                <Filter className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-gray-900">
                  No matching events found
                </h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  {statusFilter !== 'all' && search
                    ? `No events matching "${search}" with delivery status "${statusFilter}".`
                    : statusFilter === 'failed'
                    ? 'All good! There are no failed deliveries for this mailbox.'
                    : statusFilter === 'retrying'
                    ? 'No webhook deliveries are currently waiting in retry backoff.'
                    : statusFilter === 'pending'
                    ? 'No webhook deliveries currently pending in queue.'
                    : statusFilter !== 'all'
                    ? `No webhook events currently have status "${statusFilter}".`
                    : `No webhook events match query "${search}".`}
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setSearch('');
                    setOffset(0);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Filter & Show All ({selectedEndpoint?.events_count || total})</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Events Table */}
              <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-5 py-3 font-semibold">Event ID</th>
                  <th className="px-5 py-3 font-semibold">Received</th>
                  <th className="px-5 py-3 font-semibold">Idempotency Key</th>
                  <th className="px-5 py-3 font-semibold">Signature</th>
                  <th className="px-5 py-3 font-semibold">Delivery Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {filteredItems.map((evt) => {
                  const isCopied = copiedId === evt.id;
                  const isFailed = evt.delivery_status === 'failed';
                  const isRetrying = evt.delivery_status === 'retrying';

                  return (
                    <tr
                      key={evt.id}
                      className="hover:bg-gray-50/80 transition-colors group cursor-pointer"
                      onClick={() => setInspectingEventId(evt.id)}
                    >
                      {/* Event ID with copy */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span className="font-semibold text-gray-900">
                            {evt.id.substring(0, 8)}...
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(evt.id, evt.id);
                            }}
                            className="text-gray-400 hover:text-gray-700 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Copy full event ID"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="px-5 py-3.5 font-sans">
                        <div className="flex items-center gap-1.5 text-gray-700">
                          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span title={new Date(evt.received_at).toISOString()}>
                            {formatRelativeTime(evt.received_at)}
                          </span>
                        </div>
                      </td>

                      {/* Idempotency Key */}
                      <td className="px-5 py-3.5 font-mono">
                        {evt.idempotency_key ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-700 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 max-w-[160px] truncate">
                            <Key className="w-3 h-3 text-gray-400 shrink-0" />
                            {evt.idempotency_key}
                          </span>
                        ) : (
                          <span className="text-gray-400 font-sans text-[11px]">
                            None
                          </span>
                        )}
                      </td>

                      {/* Signature status */}
                      <td className="px-5 py-3.5 font-sans">
                        <Badge
                          status={evt.signature_valid ? 'delivered' : 'pending'}
                          label={
                            evt.signature_valid
                              ? 'Verified'
                              : 'Captured (202)'
                          }
                        />
                      </td>

                      {/* Delivery Status */}
                      <td className="px-5 py-3.5 font-sans">
                        {evt.delivery_status === 'delivered' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>Delivered ({evt.delivery_status_code || 200})</span>
                          </span>
                        ) : isFailed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            <span>Failed ({evt.delivery_status_code || '503'})</span>
                          </span>
                        ) : isRetrying ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span>Retrying ({evt.delivery_attempts || 1}/5)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            <span>Queued</span>
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-5 py-3.5 text-right font-sans">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              replaySingleMutation.mutate(evt.id);
                            }}
                            disabled={replaySingleMutation.isPending && replaySingleMutation.variables === evt.id}
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded transition-colors ${
                              isFailed
                                ? 'text-red-700 bg-red-50 hover:bg-red-100 border border-red-200'
                                : 'text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200'
                            }`}
                            title="Replay webhook delivery to target destination"
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${
                                replaySingleMutation.isPending &&
                                replaySingleMutation.variables === evt.id
                                  ? 'animate-spin'
                                  : ''
                              }`}
                            />
                            <span>Replay</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectingEventId(evt.id);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-900 p-1 rounded"
                          >
                            <span>Inspect</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-600">
            <div className="flex items-center gap-3">
              <span>
                Showing{' '}
                <span className="font-semibold text-gray-900">
                  {total === 0 ? 0 : offset + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-gray-900">
                  {Math.min(offset + limit, total)}
                </span>{' '}
                of <span className="font-semibold text-gray-900">{total}</span> events
              </span>

              <div className="flex items-center gap-1.5 pl-3 border-l border-gray-200">
                <span className="text-gray-500">Per page:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setOffset(0);
                  }}
                  className="h-7 px-1.5 text-xs bg-white border border-gray-300 rounded focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-500">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePrevPage}
                disabled={offset === 0}
                icon={ChevronLeft}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleNextPage}
                disabled={offset + limit >= total}
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )}

      {/* Event Detail Modal */}
      {inspectingEventId && (
        <EventDetailModal
          eventId={inspectingEventId}
          onClose={() => setInspectingEventId(null)}
        />
      )}
    </div>
  );
};

export default EventsView;
