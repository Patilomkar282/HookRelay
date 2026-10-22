import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchEndpoints,
  createEndpoint,
  updateEndpoint,
  deleteEndpoint,
  rotateSigningSecret,
  replayFailedDeliveries,
} from '../../api/client';
import Button from '../common/Button';
import Badge from '../common/Badge';
import EmptyState from '../common/EmptyState';
import Toast from '../common/Toast';
import CreateEndpointModal from './CreateEndpointModal';
import EditEndpointModal from './EditEndpointModal';
import RotateSecretModal from './RotateSecretModal';
import {
  Plus,
  Radio,
  Search,
  Copy,
  Check,
  Eye,
  EyeOff,
  RotateCw,
  Edit2,
  Trash2,
  Send,
  ExternalLink,
  Inbox,
  Filter,
  ShieldCheck,
  Zap,
  RefreshCw,
} from 'lucide-react';

export const EndpointsView = ({ onSelectEndpointForEvents, onOpenTestModal }) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [copiedKey, setCopiedKey] = useState(null);
  const [revealedSecrets, setRevealedSecrets] = useState({});

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState(null);
  const [rotatingEndpoint, setRotatingEndpoint] = useState(null);
  const [deletingEndpoint, setDeletingEndpoint] = useState(null);

  // Toast state
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Queries
  const {
    data: endpoints = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['endpoints'],
    queryFn: fetchEndpoints,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createEndpoint,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      showToast(`Mailbox /h/${data.slug} created successfully!`);
    },
    onError: (err) => showToast(err.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateEndpoint(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      showToast('Endpoint configuration updated');
    },
    onError: (err) => showToast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEndpoint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      setDeletingEndpoint(null);
      showToast('Endpoint deleted');
    },
    onError: (err) => showToast(err.message, 'error'),
  });

  const rotateMutation = useMutation({
    mutationFn: rotateSigningSecret,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      setRotatingEndpoint(null);
      showToast(`Rotated secret for /h/${data.slug}`);
    },
    onError: (err) => showToast(err.message, 'error'),
  });

  const replayFailedMutation = useMutation({
    mutationFn: (endpointId) => replayFailedDeliveries(endpointId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      queryClient.invalidateQueries({ queryKey: ['endpointEvents'] });
      showToast(data.message || `Replayed ${data.replayed_count} failed deliveries`);
    },
    onError: (err) => showToast(err.message, 'error'),
  });

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleRevealSecret = (id) => {
    setRevealedSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleActive = (ep) => {
    updateMutation.mutate({
      id: ep.id,
      data: { is_active: !ep.is_active },
    });
  };

  // Filtered endpoints
  const filteredEndpoints = endpoints.filter((ep) => {
    const term = search.toLowerCase();
    const matchesSearch =
      (ep.name && ep.name.toLowerCase().includes(term)) ||
      (ep.description && ep.description.toLowerCase().includes(term)) ||
      ep.slug.toLowerCase().includes(term) ||
      ep.target_url.toLowerCase().includes(term) ||
      ep.provider_type.toLowerCase().includes(term);
    const matchesProvider =
      providerFilter === 'all' || ep.provider_type === providerFilter;
    return matchesSearch && matchesProvider;
  });

  // Aggregated Stats
  const totalCount = endpoints.length;
  const activeCount = endpoints.filter((e) => e.is_active).length;
  const totalEvents = endpoints.reduce((acc, curr) => acc + (curr.events_count || 0), 0);

  const baseUrl = window.location.origin.includes('5173')
    ? 'http://localhost:8000'
    : window.location.origin;

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

      {/* Top Banner & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Mailboxes
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Radio className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Active Listeners
            </p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Captured Webhooks
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalEvents}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Inbox className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter by slug, target URL, or provider..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-xs bg-gray-50 border border-gray-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Provider Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0 hidden sm:block" />
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="h-9 px-2.5 text-xs bg-gray-50 border border-gray-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="all">All Providers</option>
              <option value="custom">Custom Webhooks</option>
              <option value="shopify">Shopify</option>
              <option value="stripe">Stripe</option>
              <option value="github">GitHub</option>
              <option value="razorpay">Razorpay</option>
              <option value="slack">Slack / Twilio</option>
            </select>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            icon={RotateCw}
            onClick={() => refetch()}
            isLoading={isRefetching}
            title="Refresh mailboxes"
          >
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={() => setIsCreateOpen(true)}
          >
            Create Mailbox
          </Button>
        </div>
      </div>

      {/* Endpoints List */}
      {isLoading ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-xs text-gray-500">
          Loading mailboxes...
        </div>
      ) : filteredEndpoints.length === 0 ? (
        <EmptyState
          icon={Radio}
          title={search ? 'No matching mailboxes found' : 'No Webhook Mailboxes Yet'}
          description={
            search
              ? 'Try adjusting your search filter or clear the query.'
              : 'Create a unique webhook mailbox URL to start capturing, verifying, and storing webhook payloads.'
          }
          actionLabel={search ? 'Clear Search' : 'Create First Mailbox'}
          onAction={() => {
            if (search) {
              setSearch('');
              setProviderFilter('all');
            } else {
              setIsCreateOpen(true);
            }
          }}
        />
      ) : (
        <div className="space-y-4">
          {filteredEndpoints.map((ep) => {
            const ingestUrl = `${baseUrl}/h/${ep.slug}`;
            const isSecretRevealed = !!revealedSecrets[ep.id];
            const isCopiedSlug = copiedKey === `slug-${ep.id}`;
            const isCopiedSecret = copiedKey === `sec-${ep.id}`;

            return (
              <div
                key={ep.id}
                className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs hover:border-gray-300 transition-all space-y-4"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-gray-100">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      <h3 className="text-sm font-bold text-gray-900 tracking-tight">
                        {ep.name || `/h/${ep.slug}`}
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono bg-gray-100 text-gray-700 border border-gray-200">
                        {ep.provider_type}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(ep)}
                        title={ep.is_active ? 'Click to pause mailbox' : 'Click to activate mailbox'}
                        className="cursor-pointer transition-transform hover:scale-105"
                      >
                        <Badge
                          status={ep.is_active ? 'delivered' : 'pending'}
                          label={ep.is_active ? 'Active' : 'Paused'}
                        />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 font-mono">
                      <span>slug: <code className="text-gray-700 font-semibold">{ep.slug}</code></span>
                      <span>•</span>
                      <span>Created {new Date(ep.created_at).toLocaleDateString()}</span>
                      {ep.custom_signature_header && (
                        <>
                          <span>•</span>
                          <span className="text-indigo-600 font-sans font-medium">
                            Header: <code className="font-mono bg-indigo-50 px-1 py-0.2 rounded border border-indigo-100">{ep.custom_signature_header}</code>
                          </span>
                        </>
                      )}
                    </div>

                    {ep.description && (
                      <p className="text-xs text-gray-600 pt-0.5 leading-relaxed font-sans">
                        {ep.description}
                      </p>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => onOpenTestModal?.(ep)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                      title="Send test webhook payload"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Test Mailbox</span>
                    </button>

                    <button
                      onClick={() => onSelectEndpointForEvents?.(ep.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                      title="View captured webhook events"
                    >
                      <Inbox className="w-3.5 h-3.5 text-gray-500" />
                      <span>
                        Events{' '}
                        <span className="font-semibold text-gray-900">
                          ({ep.events_count || 0})
                        </span>
                      </span>
                    </button>

                    <button
                      onClick={() => replayFailedMutation.mutate(ep.id)}
                      disabled={replayFailedMutation.isPending}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors"
                      title="Bulk replay failed deliveries for this endpoint"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          replayFailedMutation.isPending &&
                          replayFailedMutation.variables === ep.id
                            ? 'animate-spin'
                            : ''
                        }`}
                      />
                      <span>Replay Failed</span>
                    </button>

                    <button
                      onClick={() => setEditingEndpoint(ep)}
                      className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                      title="Edit endpoint configuration"
                      aria-label="Edit endpoint"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setDeletingEndpoint(ep)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete endpoint"
                      aria-label="Delete endpoint"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                  {/* Public Mailbox Ingest URL */}
                  <div className="p-3 bg-gray-50/70 border border-gray-200 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between text-gray-600">
                      <span className="font-semibold text-[11px] text-gray-700 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        Public Ingest Mailbox URL (POST)
                      </span>
                      <button
                        onClick={() => handleCopy(ingestUrl, `slug-${ep.id}`)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1"
                      >
                        {isCopiedSlug ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy URL</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="font-mono text-gray-900 bg-white border border-gray-200 px-2.5 py-1.5 rounded text-xs truncate select-all">
                      {ingestUrl}
                    </div>
                  </div>

                  {/* Forwarding Target URL */}
                  <div className="p-3 bg-gray-50/70 border border-gray-200 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between text-gray-600">
                      <span className="font-semibold text-[11px] text-gray-700 flex items-center gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                        Forwarding Destination URL
                      </span>
                      <button
                        onClick={() => setEditingEndpoint(ep)}
                        className="text-xs text-gray-500 hover:text-gray-900 font-medium"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="font-mono text-gray-700 bg-white border border-gray-200 px-2.5 py-1.5 rounded text-xs truncate select-all">
                      {ep.target_url}
                    </div>
                  </div>
                </div>

                {/* Signing Secret Box */}
                <div className="p-3 bg-gray-50/50 border border-gray-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 font-mono flex-1 min-w-0">
                    <span className="text-[11px] font-semibold text-gray-600 uppercase font-sans shrink-0">
                      Signing Secret:
                    </span>
                    <span className="font-mono text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded truncate select-all max-w-xs">
                      {isSecretRevealed
                        ? ep.signing_secret
                        : `${ep.signing_secret?.substring(0, 8)}••••••••••••••••`}
                    </span>
                    <button
                      onClick={() => toggleRevealSecret(ep.id)}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded"
                      title={isSecretRevealed ? 'Hide secret' : 'Reveal secret'}
                    >
                      {isSecretRevealed ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() =>
                        handleCopy(ep.signing_secret || '', `sec-${ep.id}`)
                      }
                      className="text-gray-400 hover:text-gray-600 p-1 rounded"
                      title="Copy signing secret"
                    >
                      {isCopiedSecret ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <button
                    onClick={() => setRotatingEndpoint(ep)}
                    className="text-xs text-amber-700 hover:text-amber-900 font-medium inline-flex items-center gap-1 shrink-0"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>Rotate Secret</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <CreateEndpointModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={async (data) => {
          return await createMutation.mutateAsync(data);
        }}
        isLoading={createMutation.isPending}
      />

      {/* Edit Modal */}
      <EditEndpointModal
        isOpen={!!editingEndpoint}
        endpoint={editingEndpoint}
        onClose={() => setEditingEndpoint(null)}
        onSubmit={async (id, data) => {
          await updateMutation.mutateAsync({ id, data });
          setEditingEndpoint(null);
        }}
        isLoading={updateMutation.isPending}
      />

      {/* Rotate Secret Modal */}
      <RotateSecretModal
        isOpen={!!rotatingEndpoint}
        endpoint={rotatingEndpoint}
        onClose={() => setRotatingEndpoint(null)}
        onConfirm={async (id) => {
          await rotateMutation.mutateAsync(id);
        }}
        isLoading={rotateMutation.isPending}
      />

      {/* Delete Confirmation Modal */}
      {deletingEndpoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-sm w-full p-6 space-y-4 text-left">
            <h3 className="text-base font-semibold text-gray-900">
              Delete Webhook Mailbox?
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              This will permanently delete mailbox{' '}
              <span className="font-mono text-gray-900 font-medium">
                /h/{deletingEndpoint.slug}
              </span>{' '}
              and cascade delete all its captured events.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setDeletingEndpoint(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                isLoading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deletingEndpoint.id)}
              >
                Delete Forever
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EndpointsView;
