import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Zap,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import Logo from '../common/Logo';

const LIVE_EVENTS = [
  {
    provider: 'Stripe',
    event: 'payment.captured',
    payloadDetail: '$250.00 • cust_8831',
    latency: '11ms',
    destination: 'api.internal/billing',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  {
    provider: 'GitHub',
    event: 'deployment.status',
    payloadDetail: 'prod-v2.4 • success',
    latency: '14ms',
    destination: 'ci.internal/webhooks',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  },
  {
    provider: 'Shopify',
    event: 'orders.fulfilled',
    payloadDetail: 'order #9821 • expedited',
    latency: '9ms',
    destination: 'inventory.internal/sync',
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-200'
  },
  {
    provider: 'Razorpay',
    event: 'payment.authorized',
    payloadDetail: '₹4,999 • rzp_live_99',
    latency: '12ms',
    destination: 'checkout.internal/pay',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200'
  }
];

export const AuthCard = () => {
  const { login, register, authError, setAuthError } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Micro-interaction states
  const [activeEventIndex, setActiveEventIndex] = useState(0);
  const [selectedFeature, setSelectedFeature] = useState(0);
  const [flowStep, setFlowStep] = useState(0); // 0: Source->HR, 1: HR->Dest, 2: Dest->HR, 3: HR->Source

  // Cycle through simulated live webhook transmissions and bidirectional steps
  useEffect(() => {
    const timer = setInterval(() => {
      setFlowStep((prev) => {
        const next = (prev + 1) % 4;
        if (next === 0) {
          setActiveEventIndex((e) => (e + 1) % LIVE_EVENTS.length);
        }
        return next;
      });
    }, 1100);
    return () => clearInterval(timer);
  }, []);

  const currentEvent = LIVE_EVENTS[activeEventIndex];

  const validate = () => {
    let isValid = true;
    setEmailError('');
    setPasswordError('');

    if (!email || !email.includes('@')) {
      setEmailError('Please enter a valid work or personal email');
      isValid = false;
    }
    if (!password || password.length < 6) {
      setPasswordError('Password must contain at least 6 characters');
      isValid = false;
    }
    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setAuthError(null);
    try {
      if (isRegister) {
        await register(email, password, fullName.trim() || null);
      } else {
        await login(email, password);
      }
    } catch {
      // Error handled in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full h-full min-h-screen lg:min-h-0 lg:h-screen flex flex-col lg:flex-row bg-white text-gray-900 font-sans selection:bg-indigo-500 selection:text-white lg:overflow-hidden">
      {/* =========================================================================
          LEFT COLUMN: Fits Screen Height with Clean Architecture Visualizer
          ========================================================================= */}
      <div className="w-full lg:w-1/2 h-full flex flex-col justify-between p-4 sm:p-8 lg:p-10 xl:p-12 bg-gradient-to-br from-indigo-50/60 via-slate-50/40 to-white border-b lg:border-b-0 lg:border-r border-gray-200 relative overflow-hidden">
        {/* Subtle ambient light glow */}
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-indigo-200/20 blur-3xl pointer-events-none animate-pulse-glow" />

        {/* Top Branding */}
        <div className="relative z-10 flex items-center">
          <Logo className="h-12 sm:h-14 md:h-16 w-auto drop-shadow-2xs" />
        </div>

        {/* Main Content Area: Responsive & Cleanly Fitted */}
        <div className="relative z-10 my-4 lg:my-auto w-full max-w-xl xl:max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-2.5">
            <Zap className="w-3 h-3 text-indigo-600" />
            Zero-Loss Ingestion Pipeline
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-extrabold tracking-tight text-gray-900 leading-[1.2]">
            Reliable webhook ingestion with instant 202 acks.
          </h1>

          <p className="mt-2 text-xs sm:text-sm text-gray-600 leading-relaxed max-w-xl">
            Shield downstream applications from traffic spikes. Automatically verify HMAC
            signatures, ingest payloads with sub-15ms response times, and replay failed deliveries safely.
          </p>

          {/* =========================================================================
              REALTIME BIDIRECTIONAL WEBHOOK PIPELINE
              ========================================================================= */}
          <div className="mt-5 w-full p-3 sm:p-3.5 rounded-xl bg-white/95 border border-gray-200 shadow-sm relative overflow-hidden">
            {/* Telemetry Header */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2.5 mb-3 border-b border-gray-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="font-bold text-gray-800 text-[11px] tracking-tight">
                  Realtime Webhook Relay Engine
                </span>
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 hidden sm:inline">
                  Bi-Directional Flow
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono shrink-0">
                <span
                  className={`px-2 py-0.5 rounded-full font-semibold transition-all duration-300 ${
                    flowStep === 0 || flowStep === 1
                      ? 'bg-indigo-100 text-indigo-800 font-bold'
                      : 'bg-emerald-100 text-emerald-800 font-bold'
                  }`}
                >
                  {flowStep === 0 && '1. Ingesting POST →'}
                  {flowStep === 1 && '2. Forwarding Target →'}
                  {flowStep === 2 && '3. ← Target 200 OK'}
                  {flowStep === 3 && '4. ← 202 Confirmed'}
                </span>
              </div>
            </div>

            {/* 3 Nodes with Bidirectional Animated Connectors */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1 sm:gap-1.5 md:gap-2">
              {/* Step 1: Provider / Source */}
              <div
                className={`flex-1 min-w-0 p-2 sm:p-2.5 rounded-xl border transition-all duration-300 ${
                  flowStep === 0
                    ? 'bg-white border-indigo-400 shadow-sm ring-2 ring-indigo-400/25'
                    : flowStep === 3
                    ? 'bg-emerald-50/50 border-emerald-300'
                    : 'bg-slate-50/80 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">
                    Source
                  </span>
                  <span
                    className={`text-[9px] px-1 py-0.5 rounded font-semibold border shrink-0 ${currentEvent.badgeColor}`}
                  >
                    {currentEvent.provider}
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-gray-900 truncate">
                  {currentEvent.event}
                </p>
                <p className="text-[10px] text-gray-500 font-mono truncate mt-0.5">
                  {currentEvent.payloadDetail}
                </p>
              </div>

              {/* Connector 1: Source <---> HookRelay (Desktop) */}
              <div className="hidden sm:flex flex-col items-center justify-center w-8 sm:w-11 md:w-13 shrink-0 px-0.5 select-none">
                {/* Forward Lane (Top): POST */}
                <div className="w-full flex flex-col items-center mb-1.5">
                  <div className="flex items-center justify-between w-full text-[7.5px] font-mono font-bold text-indigo-700 leading-none mb-0.5">
                    <span>POST</span>
                    <span className="text-[7px] text-indigo-400">→</span>
                  </div>
                  <div className="w-full h-1.5 bg-indigo-100/90 rounded-full relative overflow-visible flex items-center shadow-2xs">
                    {/* Animated Traveling Packet */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-600 shadow-sm shadow-indigo-500 ${
                        flowStep === 0 ? 'animate-flow-forward-x scale-125 ring-2 ring-indigo-300' : 'animate-flow-forward-x opacity-60'
                      }`}
                    />
                    {/* Arrow Stream */}
                    <div className="w-full flex justify-around text-indigo-500 text-[9px] font-bold leading-none select-none animate-chevron-right">
                      <span>›</span>
                      <span>›</span>
                    </div>
                  </div>
                </div>

                {/* Reverse Lane (Bottom): 202 ACK */}
                <div className="w-full flex flex-col items-center mt-0.5">
                  <div className="w-full h-1.5 bg-emerald-100/90 rounded-full relative overflow-visible flex items-center shadow-2xs">
                    {/* Animated Traveling Return Packet */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-400 ${
                        flowStep === 3 ? 'animate-flow-reverse-x scale-125 ring-2 ring-emerald-300' : 'animate-flow-reverse-x opacity-60'
                      }`}
                    />
                    {/* Arrow Stream Reverse */}
                    <div className="w-full flex justify-around text-emerald-600 text-[9px] font-bold leading-none select-none animate-chevron-left">
                      <span>‹</span>
                      <span>‹</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between w-full text-[7.5px] font-mono font-bold text-emerald-700 leading-none mt-0.5">
                    <span className="text-[7px] text-emerald-500">←</span>
                    <span>202</span>
                  </div>
                </div>
              </div>

              {/* Connector 1: Source <---> HookRelay (Mobile Vertical) */}
              <div className="flex sm:hidden items-center justify-around py-1.5 bg-gray-50/60 rounded-lg my-0.5">
                <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-indigo-700">
                  <span>POST ▼</span>
                  <div className="h-4 w-1.5 bg-indigo-100 rounded-full relative overflow-hidden">
                    <div className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-indigo-600 animate-flow-forward-y" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-emerald-700">
                  <div className="h-4 w-1.5 bg-emerald-100 rounded-full relative overflow-hidden">
                    <div className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-500 animate-flow-reverse-y" />
                  </div>
                  <span>▲ 202 ACK</span>
                </div>
              </div>

              {/* Step 2: HookRelay Ingestion Gateway */}
              <div
                className={`flex-1 min-w-0 p-2 sm:p-2.5 rounded-xl border transition-all duration-300 ${
                  flowStep === 1 || flowStep === 3
                    ? 'bg-indigo-50/90 border-indigo-500 shadow-sm ring-2 ring-indigo-500/25'
                    : 'bg-indigo-50/60 border-indigo-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <Logo size="xs" showText={false} className="h-3.5 w-3.5 rounded-xs shrink-0" />
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider truncate">
                      HookRelay
                    </span>
                  </div>
                  <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-100/70 px-1 py-0.5 rounded shrink-0">
                    202 Ack
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-indigo-950 flex items-center gap-1 truncate">
                  <ShieldCheck className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span className="truncate">HMAC Valid</span>
                </p>
                <p className="text-[10px] text-indigo-600 font-mono mt-0.5 truncate">
                  Latency: <span className="font-semibold">{currentEvent.latency}</span>
                </p>
              </div>

              {/* Connector 2: HookRelay <---> Destination (Desktop) */}
              <div className="hidden sm:flex flex-col items-center justify-center w-8 sm:w-11 md:w-13 shrink-0 px-0.5 select-none">
                {/* Forward Lane (Top): SEND */}
                <div className="w-full flex flex-col items-center mb-1.5">
                  <div className="flex items-center justify-between w-full text-[7.5px] font-mono font-bold text-indigo-700 leading-none mb-0.5">
                    <span>SEND</span>
                    <span className="text-[7px] text-indigo-400">→</span>
                  </div>
                  <div className="w-full h-1.5 bg-indigo-100/90 rounded-full relative overflow-visible flex items-center shadow-2xs">
                    {/* Animated Traveling Packet */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-600 shadow-sm shadow-indigo-500 ${
                        flowStep === 1 ? 'animate-flow-forward-x scale-125 ring-2 ring-indigo-300' : 'animate-flow-forward-x opacity-60'
                      }`}
                      style={{ animationDelay: '0.4s' }}
                    />
                    {/* Arrow Stream */}
                    <div className="w-full flex justify-around text-indigo-500 text-[9px] font-bold leading-none select-none animate-chevron-right">
                      <span>›</span>
                      <span>›</span>
                    </div>
                  </div>
                </div>

                {/* Reverse Lane (Bottom): 200 OK */}
                <div className="w-full flex flex-col items-center mt-0.5">
                  <div className="w-full h-1.5 bg-emerald-100/90 rounded-full relative overflow-visible flex items-center shadow-2xs">
                    {/* Animated Traveling Return Packet */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-400 ${
                        flowStep === 2 ? 'animate-flow-reverse-x scale-125 ring-2 ring-emerald-300' : 'animate-flow-reverse-x opacity-60'
                      }`}
                      style={{ animationDelay: '0.4s' }}
                    />
                    {/* Arrow Stream Reverse */}
                    <div className="w-full flex justify-around text-emerald-600 text-[9px] font-bold leading-none select-none animate-chevron-left">
                      <span>‹</span>
                      <span>‹</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between w-full text-[7.5px] font-mono font-bold text-emerald-700 leading-none mt-0.5">
                    <span className="text-[7px] text-emerald-500">←</span>
                    <span>200</span>
                  </div>
                </div>
              </div>

              {/* Connector 2: HookRelay <---> Destination (Mobile Vertical) */}
              <div className="flex sm:hidden items-center justify-around py-1.5 bg-gray-50/60 rounded-lg my-0.5">
                <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-indigo-700">
                  <span>SEND ▼</span>
                  <div className="h-4 w-1.5 bg-indigo-100 rounded-full relative overflow-hidden">
                    <div className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-indigo-600 animate-flow-forward-y" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-emerald-700">
                  <div className="h-4 w-1.5 bg-emerald-100 rounded-full relative overflow-hidden">
                    <div className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-500 animate-flow-reverse-y" />
                  </div>
                  <span>▲ 200 OK</span>
                </div>
              </div>

              {/* Step 3: Destination Consumer */}
              <div
                className={`flex-1 min-w-0 p-2 sm:p-2.5 rounded-xl border transition-all duration-300 ${
                  flowStep === 2
                    ? 'bg-emerald-50/90 border-emerald-400 shadow-sm ring-2 ring-emerald-400/25'
                    : 'bg-slate-50/80 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">
                    Destination
                  </span>
                  <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-100/70 px-1 py-0.5 rounded shrink-0">
                    200 OK
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-gray-900 truncate">
                  Delivered
                </p>
                <p className="text-[10px] text-gray-500 font-mono truncate mt-0.5">
                  {currentEvent.destination}
                </p>
              </div>
            </div>

            {/* Connecting Footer */}
            <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-500">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1 text-indigo-700 font-semibold font-mono">
                  <span>→ Forward:</span> <span className="text-gray-500 font-normal">Payload Dispatch</span>
                </span>
                <span className="text-gray-300 hidden sm:inline">•</span>
                <span className="flex items-center gap-1 text-emerald-700 font-semibold font-mono">
                  <span>← Reverse:</span> <span className="text-gray-500 font-normal">ACK &amp; Telemetry</span>
                </span>
              </div>
              <div className="flex items-center gap-1 font-mono shrink-0">
                {LIVE_EVENTS.map((ev, idx) => (
                  <button
                    key={ev.provider}
                    type="button"
                    onClick={() => {
                      setActiveEventIndex(idx);
                      setFlowStep(0);
                    }}
                    className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                      activeEventIndex === idx ? 'bg-indigo-600 w-3' : 'bg-gray-300 hover:bg-gray-400'
                    }`}
                    title={`Switch to ${ev.provider}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 3 Compact Feature Pills */}
          <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setSelectedFeature(0)}
              className={`p-2.5 rounded-lg border text-left transition-all duration-200 cursor-pointer ${
                selectedFeature === 0
                  ? 'bg-white border-indigo-300 shadow-2xs'
                  : 'bg-white/60 border-gray-200 hover:bg-white hover:border-gray-300'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-indigo-600 mb-0.5" />
              <p className="text-[11px] font-semibold text-gray-900">&lt; 15ms Ingestion</p>
              <p className="text-[10px] text-gray-500">Fast 202 ack</p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFeature(1)}
              className={`p-2.5 rounded-lg border text-left transition-all duration-200 cursor-pointer ${
                selectedFeature === 1
                  ? 'bg-white border-indigo-300 shadow-2xs'
                  : 'bg-white/60 border-gray-200 hover:bg-white hover:border-gray-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 mb-0.5" />
              <p className="text-[11px] font-semibold text-gray-900">HMAC-SHA256</p>
              <p className="text-[10px] text-gray-500">Signature verify</p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFeature(2)}
              className={`p-2.5 rounded-lg border text-left transition-all duration-200 cursor-pointer ${
                selectedFeature === 2
                  ? 'bg-white border-indigo-300 shadow-2xs'
                  : 'bg-white/60 border-gray-200 hover:bg-white hover:border-gray-300'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-sky-600 mb-0.5" />
              <p className="text-[11px] font-semibold text-gray-900">Smart Retries</p>
              <p className="text-[10px] text-gray-500">Backoff jitter</p>
            </button>
          </div>
        </div>

        {/* Minimal Footer Info */}
        <div className="relative z-10 pt-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
          <span className="text-[11px] font-medium text-gray-500">Enterprise Webhook Platform</span>
          <span className="text-[11px] text-gray-400">SOC-2 Type II &amp; ISO 27001 Compliant</span>
        </div>
      </div>

      {/* =========================================================================
          RIGHT COLUMN: Compact Form Fitted Cleanly to Viewport
          ========================================================================= */}
      <div className="w-full lg:w-1/2 h-full flex flex-col justify-between p-4 sm:p-8 lg:p-10 xl:p-12 bg-white relative overflow-y-auto lg:overflow-hidden">

        {/* Centered Form Wrapper: Compact & Fitted */}
        <div className="my-auto py-3 max-w-sm sm:max-w-md w-full mx-auto">
          {/* Segmented Mode Switcher */}
          <div className="p-1 rounded-xl bg-gray-100 border border-gray-200/80 flex items-center mb-4 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setIsRegister(false);
                setAuthError(null);
                setEmailError('');
                setPasswordError('');
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                !isRegister
                  ? 'bg-white text-gray-900 shadow-xs border border-gray-200/60'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegister(true);
                setAuthError(null);
                setEmailError('');
                setPasswordError('');
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                isRegister
                  ? 'bg-white text-gray-900 shadow-xs border border-gray-200/60'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Form Content */}
          <div key={isRegister ? 'register-view' : 'signin-view'} className="animate-fade-in-up">
            {/* Mobile Brand Logo */}
            <div className="flex lg:hidden items-center justify-center mb-5">
              <Logo className="h-12 sm:h-14 w-auto drop-shadow-2xs" />
            </div>

            {/* Title & Microcopy */}
            <div className="mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                {isRegister ? 'Create your developer account' : 'Welcome back'}
              </h2>
              <p className="text-xs text-gray-500 mt-1 leading-normal">
                {isRegister
                  ? 'Register to deploy public ingestion mailboxes and manage forwarding policies.'
                  : 'Enter your credentials to access your webhook mailboxes and event stream.'}
              </p>
            </div>

            {/* Error Banner */}
            {authError && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2 animate-fade-in-up">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="leading-tight text-[11px]">{authError}</span>
              </div>
            )}

            {/* Form Fields */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {isRegister && (
                <div className="space-y-1 text-left animate-fade-in-up">
                  <label
                    htmlFor="register-fullname"
                    className="block text-xs font-semibold text-gray-700"
                  >
                    Full Name <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <input
                      id="register-fullname"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alex Morgan"
                      autoComplete="name"
                      className="w-full h-9 pl-8 pr-3 text-xs bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all duration-150"
                    />
                  </div>
                </div>
              )}

              {/* Email Address */}
              <div className="space-y-1 text-left">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="auth-email-input"
                    className="block text-xs font-semibold text-gray-700"
                  >
                    Email address <span className="text-red-500">*</span>
                  </label>
                  {emailError && (
                    <span className="text-[10px] text-red-600 font-medium animate-fade-in-up">
                      {emailError}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <input
                    id="auth-email-input"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError('');
                    }}
                    placeholder="developer@company.com"
                    required
                    autoComplete="email"
                    className={`w-full h-9 pl-8 pr-3 text-xs bg-white border rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all duration-150 ${
                      emailError
                        ? 'border-red-400 focus:ring-red-400/20 focus:border-red-500'
                        : 'border-gray-300 focus:ring-indigo-500/20 focus:border-indigo-600'
                    }`}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1 text-left">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="auth-password-input"
                    className="block text-xs font-semibold text-gray-700"
                  >
                    Password <span className="text-red-500">*</span>
                  </label>
                  {passwordError && (
                    <span className="text-[10px] text-red-600 font-medium animate-fade-in-up">
                      {passwordError}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                  <input
                    id="auth-password-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                    placeholder="••••••••••••"
                    required
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    className={`w-full h-9 pl-8 pr-9 text-xs bg-white border rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all duration-150 ${
                      passwordError
                        ? 'border-red-400 focus:ring-red-400/20 focus:border-red-500'
                        : 'border-gray-300 focus:ring-indigo-500/20 focus:border-indigo-600'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer focus:outline-none transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {isRegister && (
                  <p className="text-[10px] text-gray-500">
                    Minimum 6 characters. Passwords are securely hashed with bcrypt.
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-1.5">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-semibold text-xs tracking-wide shadow-xs transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed group"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>{isRegister ? 'Create Account & Continue' : 'Sign In to Workspace'}</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Toggle between Register & Sign In */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>{isRegister ? 'Already registered?' : 'New developer?'}</span>
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setAuthError(null);
                  setEmailError('');
                  setPasswordError('');
                }}
                className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline-offset-4 hover:underline transition-colors"
              >
                {isRegister ? 'Sign in instead' : 'Create an account'}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom subtle note */}
        <div className="pt-3 border-t border-gray-100 text-center text-[10px] text-gray-400">
          <span>Protected by AES-256 encryption • Session managed with JWT Bearer tokens</span>
        </div>
      </div>
    </div>
  );
};

export default AuthCard;
