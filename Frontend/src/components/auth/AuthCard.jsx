import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Radio,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  Zap,
  ShieldCheck,
  RotateCcw,
  Check
} from 'lucide-react';

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
  const [demoPulsed, setDemoPulsed] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState(0);

  // Cycle through simulated live webhook transmissions every 3.5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveEventIndex((prev) => (prev + 1) % LIVE_EVENTS.length);
    }, 3500);
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

  const handleFillDemo = () => {
    setEmail('demo@hookrelay.dev');
    setPassword('password123');
    setEmailError('');
    setPasswordError('');
    setAuthError(null);

    // Trigger visual pulse feedback
    setDemoPulsed(true);
    setTimeout(() => setDemoPulsed(false), 900);
  };

  const docsUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/docs`;

  return (
    <div className="w-full h-full min-h-screen lg:min-h-0 lg:h-screen flex flex-col lg:flex-row bg-white text-gray-900 font-sans selection:bg-indigo-500 selection:text-white lg:overflow-hidden">
      {/* =========================================================================
          LEFT COLUMN: Fits Screen Height with Clean Architecture Visualizer
          ========================================================================= */}
      <div className="w-full lg:w-1/2 h-full flex flex-col justify-between p-4 sm:p-8 lg:p-10 xl:p-12 bg-gradient-to-br from-indigo-50/60 via-slate-50/40 to-white border-b lg:border-b-0 lg:border-r border-gray-200 relative overflow-hidden">
        {/* Subtle ambient light glow */}
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-indigo-200/20 blur-3xl pointer-events-none animate-pulse-glow" />

        {/* Top Branding */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 transition-transform duration-300 hover:scale-105 shrink-0">
              <Radio className="w-4 h-4 text-white animate-pulse" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-gray-900 flex items-center gap-1.5">
                HookRelay
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                  Engine v1.0
                </span>
              </span>
              <p className="text-[11px] text-gray-500">Resilient Webhook Gateway</p>
            </div>
          </div>

          <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Operational • TLS 1.3</span>
          </div>
        </div>

        {/* Main Content Area: Compact, Proportional & Centered */}
        <div className="relative z-10 my-4 lg:my-auto max-w-lg">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-2.5">
            <Zap className="w-3 h-3 text-indigo-600" />
            Zero-Loss Ingestion Pipeline
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-extrabold tracking-tight text-gray-900 leading-[1.2]">
            Reliable webhook ingestion with instant 202 acks.
          </h1>

          <p className="mt-2 text-xs sm:text-sm text-gray-600 leading-relaxed max-w-lg">
            Shield downstream applications from traffic spikes. Automatically verify HMAC
            signatures, ingest payloads with sub-15ms response times, and replay failed deliveries safely.
          </p>

          {/* =========================================================================
              COMPACT ANIMATED PIPELINE
              ========================================================================= */}
          <div className="mt-5 p-3.5 rounded-xl bg-white/90 border border-gray-200/90 shadow-2xs relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-gray-100 text-xs">
              <span className="font-semibold text-gray-700 flex items-center gap-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                Live Ingestion Telemetry
              </span>
              <span className="text-[10px] text-gray-400 font-mono">
                Auto-cycling (3.5s)
              </span>
            </div>

            {/* 3-Step Node Visualizer */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
              {/* Step 1: Provider / Source */}
              <div className="p-2.5 rounded-lg bg-slate-50 border border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Source
                  </span>
                  <span
                    className={`text-[9px] px-1 py-0.5 rounded font-semibold border ${currentEvent.badgeColor}`}
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

              {/* Step 2: HookRelay Ingestion Gateway */}
              <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200/90 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                    HookRelay
                  </span>
                  <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-100/70 px-1 py-0.5 rounded">
                    202 Ack
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-indigo-950 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span>HMAC Valid</span>
                </p>
                <p className="text-[10px] text-indigo-600 font-mono mt-0.5">
                  Latency: <span className="font-semibold">{currentEvent.latency}</span>
                </p>
              </div>

              {/* Step 3: Destination Consumer */}
              <div className="p-2.5 rounded-lg bg-slate-50 border border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Destination
                  </span>
                  <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-100/70 px-1 py-0.5 rounded">
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
            <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Zero message loss • Jittered retry queue</span>
              </div>
              <div className="flex items-center gap-1 font-mono">
                {LIVE_EVENTS.map((ev, idx) => (
                  <button
                    key={ev.provider}
                    type="button"
                    onClick={() => setActiveEventIndex(idx)}
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
        <div className="relative z-10 pt-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <span className="text-[11px]">Enterprise Webhook Platform</span>
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:text-indigo-600 flex items-center gap-1 transition-colors text-[11px] font-medium group"
          >
            <span>Interactive OpenAPI Specs</span>
            <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-indigo-600 transition-colors" />
          </a>
        </div>
      </div>

      {/* =========================================================================
          RIGHT COLUMN: Compact Form Fitted Cleanly to Viewport
          ========================================================================= */}
      <div className="w-full lg:w-1/2 h-full flex flex-col justify-between p-4 sm:p-8 lg:p-10 xl:p-12 bg-white relative overflow-y-auto lg:overflow-hidden">
        {/* Top Sub-Bar */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-400 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Auth Service Ready
          </span>

          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors font-medium"
          >
            <span>API Docs</span>
            <ExternalLink className="w-3 h-3 text-gray-400" />
          </a>
        </div>

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

            {/* Quick Demo Fill Button with Tactile Feedback */}
            {!isRegister && (
              <div className="mb-3.5 p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-100 flex items-center justify-between gap-2 transition-colors">
                <div className="text-left">
                  <span className="text-xs font-semibold text-indigo-900 block leading-tight">
                    Instant Demo Credentials
                  </span>
                  <span className="text-[10px] text-indigo-700">
                    Preloaded with sample webhooks & telemetry
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleFillDemo}
                  className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer transition-all duration-150 active:scale-95 shadow-2xs flex items-center gap-1 shrink-0"
                >
                  {demoPulsed ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Filled!</span>
                    </>
                  ) : (
                    <span>Fill Demo</span>
                  )}
                </button>
              </div>
            )}

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
                      demoPulsed ? 'animate-field-highlight' : ''
                    } ${
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
                      demoPulsed ? 'animate-field-highlight' : ''
                    } ${
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
