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

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {isAuthenticated ? (
          <div className="space-y-6">
            {/* Header info bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
                  {activeTab === 'overview' && 'Webhook Relaying Console'}
                  {activeTab === 'endpoints' && 'Webhook Mailboxes'}
                  {activeTab === 'events' && 'Event Capture & Replay Stream'}
                  {activeTab === 'account' && 'Account & Security'}
                </h1>
                <p className="text-xs text-gray-500 mt-1">
                  {activeTab === 'overview' &&
                    'Live status, fast mailbox generation, and quickstart testing tools.'}
                  {activeTab === 'endpoints' &&
                    'Manage your public ingestion mailboxes, secrets, and forwarding destinations.'}
                  {activeTab === 'events' &&
                    'Inspect raw webhook headers, parsed JSON bodies, and replay requests.'}
                  {activeTab === 'account' &&
                    'Manage authentication tokens, database connection, and API credentials.'}
                </p>
              </div>

              <div>
                <Badge status="delivered" label="Module 2 Complete: 202 Ingestion" />
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
      <footer className="border-t border-gray-200 bg-white py-6 mt-auto">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700">HookRelay</span>
            <span>—</span>
            <span>FastAPI 0.115 + PostgreSQL 18 JSONB</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="text-gray-600 hover:text-gray-900 flex items-center gap-1 transition-colors"
            >
              <span>Swagger UI (/docs)</span>
              <ExternalLink className="w-3 h-3 text-gray-400" />
            </a>
            <span className="text-gray-300">|</span>
            <span className="font-mono text-gray-400">Environment: development</span>
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
