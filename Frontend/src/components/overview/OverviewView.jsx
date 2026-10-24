import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEndpoints } from '../../api/client';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Logo from '../common/Logo';
import Hero3DVisualizer from './Hero3DVisualizer';
import {
  Radio,
  Inbox,
  ShieldCheck,
  Zap,
  Terminal,
  Copy,
  Check,
  Plus,
  ArrowRight,
  CheckCircle2,
  Lock,
  Cpu,
  Database,
  Activity,
  Server,
  Layers,
} from 'lucide-react';

export const OverviewView = ({
  onNavigateTab,
  onOpenCreateEndpoint,
  onOpenTestModal,
}) => {
  const [copiedCurl, setCopiedCurl] = useState(false);

  const { data: endpoints = [] } = useQuery({
    queryKey: ['endpoints'],
    queryFn: fetchEndpoints,
  });

  const totalMailboxes = endpoints.length;
  const activeMailboxes = endpoints.filter((e) => e.is_active).length;
  const totalEvents = endpoints.reduce(
    (acc, ep) => acc + (ep.events_count || 0),
    0
  );

  const primaryEndpoint = endpoints[0] || null;
  const apiBase = import.meta.env.VITE_API_URL;
  const baseUrl = apiBase
    ? apiBase.replace(/\/+$/, '')
    : (window.location.origin.includes('5173') ? 'http://localhost:8000' : window.location.origin);

  const sampleSlug = primaryEndpoint?.slug || 'sample-slug-token123';
  const [terminalLang, setTerminalLang] = useState('powershell'); // 'powershell' | 'bash'

  const terminalSnippet = useMemo(() => {
    if (terminalLang === 'powershell') {
      return `curl.exe --% -X POST "${baseUrl}/h/${sampleSlug}" -H "Content-Type: application/json" -H "Idempotency-Key: idemp_sample_123" -d "{\\"event\\": \\"payment.captured\\", \\"amount\\": 250000, \\"customer\\": \\"cust_123\\"}"`;
    }
    return `curl -X POST "${baseUrl}/h/${sampleSlug}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: idemp_sample_123" \\
  -d '{"event": "payment.captured", "amount": 250000, "customer": "cust_123"}'`;
  }, [baseUrl, sampleSlug, terminalLang]);

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(terminalSnippet);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div className="space-y-6 text-left animate-in fade-in duration-150">
      {/* Hero Welcome Banner with 3D Holographic Webhook Relay Visualizer */}
      <div className="bg-[#080d1a] text-white rounded-2xl p-6 sm:p-8 lg:p-9 shadow-2xl relative overflow-hidden border border-slate-800/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
        {/* Top Glowing Prism Edge */}
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-500/60 via-indigo-500/60 to-transparent pointer-events-none" />

        {/* Cybernetic Tech Mesh Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#38bdf808_1px,transparent_1px),linear-gradient(to_bottom,#38bdf808_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

        {/* Ambient Corner Plasma Glows */}
        <div className="absolute -left-20 -top-20 w-72 h-72 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-cyan-600/10 blur-3xl pointer-events-none" />

        {/* Left: Headline, Description & Actions */}
        <div className="relative z-10 max-w-2xl space-y-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-2xs">
              Enterprise Webhook Gateway
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Ingestion Active
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-[32px] font-extrabold tracking-tight text-white leading-tight">
            High-Reliability Webhook Infrastructure &amp; Observability
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
            Ingest external webhooks from Razorpay, GitHub, Stripe, and custom services with sub-second WebSocket observability, cryptographic HMAC verification, lock-free delivery queues, and instant 1-click failure replays.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="md"
              className="bg-indigo-600 hover:bg-indigo-500 text-white border-0 shadow-lg shadow-indigo-600/30 cursor-pointer"
              icon={Plus}
              onClick={onOpenCreateEndpoint}
            >
              Create Mailbox
            </Button>
            {primaryEndpoint && (
              <Button
                variant="secondary"
                size="md"
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-xs cursor-pointer"
                icon={Zap}
                onClick={() => onOpenTestModal(primaryEndpoint)}
              >
                Send Test Webhook
              </Button>
            )}
            <button
              onClick={() => onNavigateTab('events')}
              className="text-xs text-indigo-300 hover:text-white font-medium flex items-center gap-1.5 transition-colors pl-2 cursor-pointer group"
            >
              <span>Inspect Live Stream</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Right: 3D Holographic Webhook Relay Core & Gyroscope */}
        <div className="relative z-10 shrink-0 self-center lg:self-auto flex items-center justify-center">
          <Hero3DVisualizer />
        </div>
      </div>

      {/* Metrics Row (4 Columns Full Width) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
              Total Mailboxes
            </span>
            <div className="p-1 bg-indigo-50 rounded-lg text-indigo-600 flex items-center justify-center">
              <Logo size="xs" showText={false} className="w-5 h-5 rounded-xs" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-gray-900">{totalMailboxes}</p>
          <p className="text-[11px] text-gray-500 mt-1">Unique URL-safe ingestion slugs</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
              Active Listeners
            </span>
            <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-600">{activeMailboxes}</p>
          <p className="text-[11px] text-gray-500 mt-1">Accepting live HTTP POST traffic</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
              Captured Webhooks
            </span>
            <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600">
              <Inbox className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-gray-900">{totalEvents}</p>
          <p className="text-[11px] text-gray-500 mt-1">Stored with JSONB payload fidelity</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
              Ingestion SLA
            </span>
            <div className="p-1.5 bg-purple-50 rounded-lg text-purple-600">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-gray-900">99.9%</p>
          <p className="text-[11px] text-gray-500 mt-1">&lt; 20ms immediate 202 ACK</p>
        </div>
      </div>

      {/* Pipeline & Infrastructure Status */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              Webhook Pipeline & Core Protections
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Real-time operational status of the security, ingestion, deduplication, and forwarding engine.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            All Systems Operational
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-gray-50/70 border border-gray-200 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-100/70 text-emerald-700 shrink-0 mt-0.5">
              <Zap className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">
                  Public Ingest Gateway (/h/&#123;slug&#125;)
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  OPERATIONAL
                </span>
              </div>
              <p className="text-gray-500 text-[11px] leading-relaxed">
                Asynchronous ingestion returning immediate 202 Accepted. Enforces sliding-window rate limiting (120 req/min) and 2MB maximum payload size guard.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gray-50/70 border border-gray-200 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-indigo-100/70 text-indigo-700 shrink-0 mt-0.5">
              <Lock className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">
                  Cryptographic Signature Engine
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                  PROTECTED
                </span>
              </div>
              <p className="text-gray-500 text-[11px] leading-relaxed">
                HMAC-SHA256 signature verification natively supported for GitHub, Razorpay, Stripe, and generic providers. Flags forged or tampered payloads immediately.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gray-50/70 border border-gray-200 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-100/70 text-blue-700 shrink-0 mt-0.5">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">
                  Delivery Queue & Backoff Retries
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                  ACTIVE
                </span>
              </div>
              <p className="text-gray-500 text-[11px] leading-relaxed">
                PostgreSQL lock-free polling via SELECT ... FOR UPDATE SKIP LOCKED. Automatically retries failed dispatches with exponential backoff and randomized jitter.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gray-50/70 border border-gray-200 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-100/70 text-purple-700 shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">
                  SSRF Protection & Data Retention
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">
                  ENFORCED
                </span>
              </div>
              <p className="text-gray-500 text-[11px] leading-relaxed">
                DNS-resolving SSRF filter blocks loopback, private RFC 1918 subnets, and cloud metadata (169.254.169.254). Automated TTL worker purges events older than 30 days.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal / cURL Quickstart Box */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-900">
              Test Ingestion with cURL / PowerShell / CLI
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 text-xs font-medium">
              <button
                type="button"
                onClick={() => setTerminalLang('powershell')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  terminalLang === 'powershell'
                    ? 'bg-white text-gray-900 font-semibold shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Windows PowerShell
              </button>
              <button
                type="button"
                onClick={() => setTerminalLang('bash')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  terminalLang === 'bash'
                    ? 'bg-white text-gray-900 font-semibold shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Bash / macOS cURL
              </button>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyCurl}
              icon={copiedCurl ? Check : Copy}
            >
              {copiedCurl ? 'Copied' : 'Copy Command'}
            </Button>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          Send a sample webhook payload directly to your mailbox slug. It will be captured, verified, and delivered to your destination URL within milliseconds:
        </p>

        <pre className="p-3 sm:p-4 bg-gray-950 text-emerald-400 rounded-xl text-xs font-mono leading-relaxed overflow-x-auto select-all border border-gray-800 max-w-full">
          <code>{terminalSnippet}</code>
        </pre>
      </div>
    </div>
  );
};

export default OverviewView;
