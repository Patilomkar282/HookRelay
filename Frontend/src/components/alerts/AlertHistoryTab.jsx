import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAlertEvents, fetchEndpoints } from '../../api/client';
import Button from '../common/Button';
import Badge from '../common/Badge';
import {
  History,
  RefreshCw,
  Inbox,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  Shield,
  Send,
  XCircle,
  Hash,
  Mail,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';

export const AlertHistoryTab = ({ showMessage }) => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 15;
  const [selectedEndpoint, setSelectedEndpoint] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // TanStack Query for endpoints filter dropdown
  const { data: endpointsData = [] } = useQuery({
    queryKey: ['endpoints'],
    queryFn: fetchEndpoints,
  });
  const endpoints = Array.isArray(endpointsData) ? endpointsData : (endpointsData.endpoints || []);

  // TanStack Query for alert events with 10s auto-refresh
  const {
    data: historyData = { items: [], total: 0 },
    isLoading: loading,
    refetch: loadHistory,
  } = useQuery({
    queryKey: ['alertEvents', selectedEndpoint, page],
    queryFn: () => fetchAlertEvents(selectedEndpoint || null, page, limit),
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const events = historyData.items || [];
  const total = historyData.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Compute stat counters
  const firingCount = events.filter((e) => e.kind === 'fired').length;
  const recoveredCount = events.filter((e) => e.kind === 'recovered').length;
  const pendingCount = events.filter((e) => e.status === 'pending').length;
  const failedCount = events.filter((e) => e.status === 'send_failed').length;

  const getKindBadge = (kind) => {
    switch (kind) {
      case 'fired':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Flame className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
            Firing
          </span>
        );
      case 'recovered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Recovered
          </span>
        );
      case 'reminder':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            Reminder
          </span>
        );
      case 'summary':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            Dead Letter
          </span>
        );
      default:
        return <Badge variant="neutral">{kind}</Badge>;
    }
  };

  const getStatusBadge = (status, error, attempts) => {
    switch (status) {
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Sent
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-950/60 text-amber-300 border border-amber-800/40 animate-pulse">
            <Clock className="w-3 h-3 text-amber-400" />
            Pending ({attempts}/3)
          </span>
        );
      case 'send_failed':
        return (
          <span
            title={error || 'Send failed'}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-950/60 text-rose-300 border border-rose-800/40 cursor-help"
          >
            <XCircle className="w-3 h-3 text-rose-400" />
            Failed {error ? `(${error})` : ''}
          </span>
        );
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const formatRuleType = (type) => {
    switch (type) {
      case 'consecutive_failures':
        return 'Consecutive Failures';
      case 'failure_rate':
        return 'Failure Rate';
      case 'dead_letter':
        return 'Dead Letter';
      default:
        return type;
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Stats Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            Alert Outbox & Delivery History
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Real-time log of every alert state transition, retried dispatches, rate limits, and recovery events.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Endpoint Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={selectedEndpoint}
              onChange={(e) => {
                setSelectedEndpoint(e.target.value);
                setPage(1);
              }}
              className="bg-slate-950 text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-800 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Mailboxes</option>
              {endpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name || ep.slug}
                </option>
              ))}
            </select>
          </div>

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors ${
              autoRefresh
                ? 'bg-indigo-600/10 text-indigo-400 border-indigo-500/30'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-indigo-400 animate-ping' : 'bg-slate-600'}`}
            />
            {autoRefresh ? 'Live (10s)' : 'Paused'}
          </button>

          {/* Manual Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadHistory()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/80">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Firing Outages</span>
            <Flame className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1">{firingCount}</div>
        </div>

        <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/80">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Recoveries</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1">{recoveredCount}</div>
        </div>

        <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/80">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Pending In-Flight</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1">{pendingCount}</div>
        </div>

        <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/80">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Send Failures</span>
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1">{failedCount}</div>
        </div>
      </div>

      {/* Main Events Table */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        {loading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
            <p className="text-sm">Loading alert event history...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <History className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <p className="text-base font-medium text-slate-200">No alert events recorded yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              When an endpoint fails consecutive deliveries or exceeds the failure rate threshold, HookRelay will record an alert event here and dispatch it via your alert channels.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Mailbox</th>
                  <th className="py-3 px-4">Event Kind</th>
                  <th className="py-3 px-4">Rule Type</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Summary Stats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {events.map((ev) => {
                  const summary = ev.summary || {};
                  return (
                    <tr key={ev.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {formatDate(ev.created_at)}
                      </td>
                      <td className="py-3 px-4 font-sans font-medium text-white whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <Inbox className="w-3.5 h-3.5 text-indigo-400" />
                          {ev.mailbox_name || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-sans whitespace-nowrap">
                        {getKindBadge(ev.kind)}
                      </td>
                      <td className="py-3 px-4 font-sans text-slate-300 whitespace-nowrap">
                        {formatRuleType(ev.rule_type)}
                      </td>
                      <td className="py-3 px-4 font-sans whitespace-nowrap">
                        <span className="flex items-center gap-1 text-slate-300">
                          {ev.channel_type === 'slack' ? (
                            <Hash className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Mail className="w-3 h-3 text-sky-400" />
                          )}
                          {ev.channel_name || 'Channel'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-sans whitespace-nowrap">
                        {getStatusBadge(ev.status, ev.error, ev.attempts)}
                      </td>
                      <td className="py-3 px-4 font-sans text-slate-400 text-xs">
                        {summary.failed_attempts !== undefined ? (
                          <span>
                            <strong className="text-slate-200">
                              {summary.failed_attempts}/{summary.total_attempts}
                            </strong>{' '}
                            failed
                            {summary.most_common_error ? (
                              <span className="text-rose-400/90 ml-1.5">
                                • {summary.most_common_error}
                              </span>
                            ) : null}
                          </span>
                        ) : summary.dead_letter_count !== undefined ? (
                          <span>
                            <strong className="text-slate-200">{summary.dead_letter_count}</strong> dead
                            letters
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {total > limit && (
          <div className="flex items-center justify-between px-4 py-3 bg-slate-950/60 border-t border-slate-800 text-xs text-slate-400">
            <div>
              Showing <span className="text-slate-200 font-semibold">{(page - 1) * limit + 1}</span> to{' '}
              <span className="text-slate-200 font-semibold">{Math.min(page * limit, total)}</span> of{' '}
              <span className="text-slate-200 font-semibold">{total}</span> events
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="py-1 px-2.5"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-slate-300">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="py-1 px-2.5"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertHistoryTab;
