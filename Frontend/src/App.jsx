import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchHealth, createEndpoint } from './api/client';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import Navbar from './components/layout/Navbar';
import AuthCard from './components/auth/AuthCard';
import UserProfileCard from './components/auth/UserProfileCard';
import OverviewView from './components/overview/OverviewView';
import EndpointsView from './components/endpoints/EndpointsView';
import EventsView from './components/events/EventsView';
import AnalyticsView from './components/analytics/AnalyticsView';
import CreateEndpointModal from './components/endpoints/CreateEndpointModal';
import WebhookTestModal from './components/tester/WebhookTestModal';
import EventDetailModal from './components/events/EventDetailModal';
import Badge from './components/common/Badge';
import Toast from './components/common/Toast';
import Logo from './components/common/Logo';

function Dashboard() {
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedEndpointIdForEvents, setSelectedEndpointIdForEvents] = useState(null);
  const [testModalEndpoint, setTestModalEndpoint] = useState(null);
  const [inspectEventId, setInspectEventId] = useState(null);
  const [isGlobalCreateOpen, setIsGlobalCreateOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const { data: health } = useQuery({
    queryKey: ['backendHealth'],
    queryFn: fetchHealth,
  });

  const createMutation = useMutation({
    mutationFn: createEndpoint,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      setIsGlobalCreateOpen(false);
      showToast(`Mailbox /h/${data.slug} created successfully!`);
    },
    onError: (err) => showToast(err.message, 'error'),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center max-w-xs text-center space-y-4">
          <Logo size="lg" className="h-10 sm:h-12 w-auto animate-pulse" />
          <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
            <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span>Initializing HookRelay session...</span>
          </div>
        </div>
      </div>
    );
  }

  // When not authenticated, show ONLY the dedicated full-screen auth screen (no navbar, no footer)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-white text-gray-900 font-sans overflow-x-hidden w-full">
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
        <AuthCard />
      </div>
    );
  }

  const handleSelectEndpointForEvents = (endpointId) => {
    setSelectedEndpointIdForEvents(endpointId);
    setActiveTab('events');
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans overflow-x-hidden w-full">
      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <Navbar
        health={health}
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
      />

      <main className="flex-1 w-full max-w-full px-3.5 sm:px-6 lg:px-10 xl:px-12 py-4 sm:py-8">
        <div className="space-y-6">
          {/* Header info bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                {activeTab === 'overview' && 'Webhook Relaying Console'}
                {activeTab === 'endpoints' && 'Webhook Mailboxes'}
                {activeTab === 'events' && 'Event Capture & Replay Stream'}
                {activeTab === 'analytics' && 'Analytics & Reliability Telemetry'}
                {activeTab === 'account' && 'Account & Security'}
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                {activeTab === 'overview' &&
                  'Live status, high-throughput mailbox infrastructure, and delivery observability.'}
                {activeTab === 'endpoints' &&
                  'Manage your public ingestion mailboxes, cryptographic secrets, and forwarding destinations.'}
                {activeTab === 'events' &&
                  'Inspect raw webhook headers, parsed JSON bodies, and real-time delivery status.'}
                {activeTab === 'analytics' &&
                  'Inspect delivery success rate, p95 latency curve, hourly throughput, and failure telemetry.'}
                {activeTab === 'account' &&
                  'Manage your profile, personal API keys, delivery policies, and security credentials.'}
              </p>
            </div>
          </div>

          {/* View Panels */}
          {activeTab === 'overview' && (
            <OverviewView
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenCreateEndpoint={() => setIsGlobalCreateOpen(true)}
              onOpenTestModal={(ep) => setTestModalEndpoint(ep)}
            />
          )}

          {activeTab === 'endpoints' && (
            <EndpointsView
              onSelectEndpointForEvents={handleSelectEndpointForEvents}
              onOpenTestModal={(ep) => setTestModalEndpoint(ep)}
            />
          )}

          {activeTab === 'events' && (
            <EventsView
              initialEndpointId={selectedEndpointIdForEvents}
              onOpenTestModal={(ep) => setTestModalEndpoint(ep)}
            />
          )}

          {activeTab === 'analytics' && <AnalyticsView />}

          {activeTab === 'account' && <UserProfileCard />}
        </div>
      </main>

      {/* Global Modals */}
      <CreateEndpointModal
        isOpen={isGlobalCreateOpen}
        onClose={() => setIsGlobalCreateOpen(false)}
        onSubmit={async (data) => {
          await createMutation.mutateAsync(data);
        }}
        isLoading={createMutation.isPending}
      />

      {testModalEndpoint && (
        <WebhookTestModal
          isOpen={!!testModalEndpoint}
          endpoint={testModalEndpoint}
          onClose={() => setTestModalEndpoint(null)}
          onInspectEvent={(eventId) => {
            setTestModalEndpoint(null);
            setInspectEventId(eventId);
          }}
        />
      )}

      {inspectEventId && (
        <EventDetailModal
          eventId={inspectEventId}
          onClose={() => setInspectEventId(null)}
        />
      )}

      {/* System Footer */}
      <footer className="border-t border-gray-200 bg-white py-5 sm:py-6 mt-auto shadow-2xs">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-12 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 sm:gap-4">
            <Logo className="h-12 sm:h-14 md:h-16 w-auto object-contain" />
            <span className="text-gray-300 hidden sm:inline">•</span>
            <span className="font-semibold text-gray-700 text-xs sm:text-sm">
              Enterprise Webhook Platform
            </span>
            <span className="text-gray-300 hidden sm:inline">•</span>
            <span className="text-gray-400 text-xs">
              © {new Date().getFullYear()} HookRelay Inc. All rights reserved.
            </span>
          </div>

          <div className="flex items-center gap-4 sm:gap-5 text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>All Systems Operational</span>
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">SOC-2 Type II</span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">TLS 1.3 Enforced</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <Dashboard />
      </WebSocketProvider>
    </AuthProvider>
  );
}
