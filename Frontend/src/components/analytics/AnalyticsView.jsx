import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchEndpoints,
  fetchStatsSummary,
  fetchStatsTimeseries,
  triggerRetentionCleanup,
} from '../../api/client';
import Button from '../common/Button';
import Badge from '../common/Badge';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Activity,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Filter,
  Zap,
  ShieldCheck,
  Server,
  Layers,
} from 'lucide-react';

export const AnalyticsView = () => {
  const queryClient = useQueryClient();
  const [selectedEndpointId, setSelectedEndpointId] = useState('all');
  const [hours, setHours] = useState(24);
  const [cleanupMessage, setCleanupMessage] = useState(null);

  // 1. Fetch endpoints for selector
  const { data: endpoints = [] } = useQuery({
    queryKey: ['endpoints'],
    queryFn: fetchEndpoints,
  });

  // 2. Fetch stats summary
  const {
    data: summary,
    isLoading: loadingSummary,
    refetch: refetchSummary,
    isRefetching: refetchingSummary,
  } = useQuery({
    queryKey: ['statsSummary', selectedEndpointId],
    queryFn: () => fetchStatsSummary(selectedEndpointId),
    refetchInterval: 10000,
  });

  // 3. Fetch timeseries data
  const {
    data: timeseriesData,
    isLoading: loadingTimeseries,
    refetch: refetchTimeseries,
    isRefetching: refetchingTimeseries,
  } = useQuery({
    queryKey: ['statsTimeseries', selectedEndpointId, hours],
    queryFn: () => fetchStatsTimeseries(selectedEndpointId, hours),
    refetchInterval: 15000,
  });

  // 4. Retention cleanup mutation
  const cleanupMutation = useMutation({
    mutationFn: (days) => triggerRetentionCleanup(days),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['statsSummary'] });
      queryClient.invalidateQueries({ queryKey: ['statsTimeseries'] });
      setCleanupMessage(`Pruned ${data.purged_count} events older than ${data.retention_days} days.`);
      setTimeout(() => setCleanupMessage(null), 4000);
    },
  });

  const handleRefresh = () => {
    refetchSummary();
    refetchTimeseries();
  };

  // Format chart time labels
  const formattedChartData = (timeseriesData?.buckets || []).map((b) => {
    try {
      const d = new Date(b.timestamp);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const dayStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return {
        ...b,
        displayTime: hours > 24 ? `${dayStr} ${timeStr}` : timeStr,
      };
    } catch {
      return { ...b, displayTime: b.timestamp };
    }
  });

  const isRefreshing = refetchingSummary || refetchingTimeseries;

  return (
    <div className="space-y-6 text-left animate-in fade-in duration-150">
      {/* Toast Notification */}
      {cleanupMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">{cleanupMessage}</span>
          </div>
          <button
            onClick={() => setCleanupMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Header & Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              Analytics & Reliability
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Telemetry
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Real-time delivery success rates, p95 latencies, throughput trends, and error telemetry.
          </p>
        </div>

        {/* Global Filter Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Endpoint Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-gray-300 rounded-lg px-2.5 h-8 text-xs shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={selectedEndpointId}
              onChange={(e) => setSelectedEndpointId(e.target.value)}
              className="bg-transparent border-0 focus:outline-none text-gray-800 font-medium cursor-pointer"
            >
              <option value="all">All Webhook Mailboxes</option>
              {endpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name ? `${ep.name} (/h/${ep.slug})` : `/h/${ep.slug}`} ({ep.provider_type})
                </option>
              ))}
            </select>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 text-xs font-medium">
            <button
              onClick={() => setHours(24)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                hours === 24
                  ? 'bg-white text-gray-900 font-semibold shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              24h
            </button>
            <button
              onClick={() => setHours(72)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                hours === 72
                  ? 'bg-white text-gray-900 font-semibold shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              3d
            </button>
            <button
              onClick={() => setHours(168)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                hours === 168
                  ? 'bg-white text-gray-900 font-semibold shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              7d
            </button>
          </div>

          {/* Refresh Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            icon={RefreshCw}
          >
            <span className={isRefreshing ? 'animate-spin' : ''}>Refresh</span>
          </Button>

          {/* Data Retention Purge Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (window.confirm('Purge webhook events older than 30 days based on data retention policy?')) {
                cleanupMutation.mutate(30);
              }
            }}
            disabled={cleanupMutation.isPending}
            icon={Trash2}
            title="Enforce 30-day retention cleanup"
          >
            Prune Old
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Success Rate */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium">Delivery Success Rate</span>
            <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-gray-900">
              {summary ? `${summary.success_rate_percent}%` : '...'}
            </span>
            <span className="text-[11px] text-gray-500">
              ({summary?.delivered_count || 0} delivered)
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, summary?.success_rate_percent || 100)}%` }}
            />
          </div>
        </div>

        {/* KPI 2: p95 Latency */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium">p95 Latency (Outbound)</span>
            <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-gray-900">
              {summary ? `${summary.p95_latency_ms}ms` : '...'}
            </span>
            <span className="text-[11px] text-gray-500">
              avg: {summary?.avg_latency_ms || 0}ms
            </span>
          </div>
          <div className="text-[11px] text-gray-500 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Target response SLA &lt; 2000ms</span>
          </div>
        </div>

        {/* KPI 3: Throughput */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium">Throughput (Capture)</span>
            <div className="p-1.5 bg-amber-50 rounded-lg text-amber-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-gray-900">
              {summary ? `${summary.events_per_hour}` : '...'}
            </span>
            <span className="text-[11px] text-gray-500">events / hour</span>
          </div>
          <div className="text-[11px] text-gray-500">
            Total captured: <span className="font-semibold text-gray-900">{summary?.total_events || 0}</span>
          </div>
        </div>

        {/* KPI 4: Failures & In-Flight Retries */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium">Failed & Retrying</span>
            <div className={`p-1.5 rounded-lg ${summary?.failed_count > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${summary?.failed_count > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {summary ? summary.failed_count : '...'}
            </span>
            <span className="text-[11px] text-gray-500">
              exhausted failures
            </span>
          </div>
          <div className="text-[11px] text-gray-500">
            In backoff queue: <span className="font-semibold text-amber-700">{summary?.retrying_count || 0}</span>
          </div>
        </div>
      </div>

      {/* Chart Row 1: Event Ingestion Volume & Outcomes Over Time */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Webhook Delivery Outcomes Over Time</h2>
            <p className="text-xs text-gray-500">
              Hourly breakdown of captured webhooks successfully delivered vs failed.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-gray-600 font-medium">Delivered</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-gray-600 font-medium">Failed</span>
            </div>
          </div>
        </div>

        <div className="h-64 w-full min-w-0 overflow-hidden">
          {loadingTimeseries ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-400">
              Loading timeseries chart...
            </div>
          ) : formattedChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-400">
              No webhook activity recorded in this time range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formattedChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorDelivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="displayTime" tick={{ fontSize: 10, fill: '#64748b' }} stroke="#cbd5e1" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} stroke="#cbd5e1" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area
                  type="monotone"
                  dataKey="delivered"
                  name="Delivered (200)"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorDelivered)"
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  name="Failed"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorFailed)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Chart Row 2: Two Columns (Latency Trends & Top Failure Reasons) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column A: Latency Distribution Trends */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-gray-900">p95 & Average Latency Trend</h2>
              <p className="text-xs text-gray-500">
                Network response latency in milliseconds to destination targets.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                <span className="text-gray-600 font-medium">p95</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                <span className="text-gray-600 font-medium">Average</span>
              </div>
            </div>
          </div>

          <div className="h-60 w-full min-w-0 overflow-hidden">
            {loadingTimeseries ? (
              <div className="h-full flex items-center justify-center text-xs text-gray-400">
                Loading latency curve...
              </div>
            ) : formattedChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-gray-400">
                No latency data recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formattedChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="displayTime" tick={{ fontSize: 10, fill: '#64748b' }} stroke="#cbd5e1" />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} stroke="#cbd5e1" unit="ms" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="p95_latency_ms"
                    name="p95 Latency"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg_latency_ms"
                    name="Avg Latency"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Column B: Top Failure Reasons & Telemetry */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Top Delivery Failure Reasons</h2>
              <p className="text-xs text-gray-500">
                Frequent error causes returned by destination endpoints.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              SQL Aggregation
            </span>
          </div>

          <div className="min-h-[240px] flex flex-col justify-center">
            {!summary?.top_failure_reasons || summary.top_failure_reasons.length === 0 ? (
              <div className="p-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200 space-y-2">
                <div className="w-10 h-10 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-xs font-semibold text-gray-800">
                  Zero Delivery Failures Detected
                </h3>
                <p className="text-[11px] text-gray-500 max-w-xs mx-auto">
                  All webhooks dispatched to destination servers responded with HTTP 200 OK.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {summary.top_failure_reasons.map((f, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="font-medium text-gray-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span className="truncate max-w-xs">{f.reason}</span>
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Status Code: <span className="font-mono font-semibold">{f.status_code || 'Network/Timeout'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-xs font-bold font-mono bg-rose-50 text-rose-700 border border-rose-200 rounded">
                        {f.count} {f.count === 1 ? 'event' : 'events'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
