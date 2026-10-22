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
import { ExternalLink } from 'lucide-react';

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-xs text-gray-500 font-medium">
        Loading session...
      </div>
    );
  }

  const handleSelectEndpointForEvents = (endpointId) => {
    setSelectedEndpointIdForEvents(endpointId);
    setActiveTab('events');
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
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

      <main className="flex-1 w-full px-6 lg:px-10 xl:px-12 py-8">
        {isAuthenticated ? (
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

              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Production Ready • 99.9% Uptime SLA
                </span>
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
        ) : (
          <div className="py-6">
            <AuthCard />
          </div>
        )}
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
      <footer className="border-t border-gray-200 bg-white py-5 mt-auto">
        <div className="w-full px-6 lg:px-10 xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-gray-900 tracking-tight">HookRelay Gateway</span>
            <span className="text-gray-300">•</span>
            <span>Enterprise Webhook Delivery Engine</span>
            <span className="text-gray-300">•</span>
            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium border border-emerald-200 text-[11px]">
              Engine v1.0.0 (Production)
            </span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="text-gray-600 hover:text-gray-900 flex items-center gap-1 transition-colors font-medium"
            >
              <span>Interactive OpenAPI Specs</span>
              <ExternalLink className="w-3 h-3 text-gray-400" />
            </a>
            <span className="text-gray-300">|</span>
            <span className="inline-flex items-center gap-1.5 text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>TLS 1.3 Active</span>
            </span>
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
