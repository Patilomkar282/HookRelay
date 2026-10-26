import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  fetchAlertChannels,
  fetchEndpoints,
} from '../../api/client';
import Button from '../common/Button';
import Input from '../common/Input';
import Badge from '../common/Badge';
import {
  ShieldAlert,
  Plus,
  Trash2,
  RefreshCw,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Hash,
  Mail,
  X,
  Power,
  Flame,
} from 'lucide-react';

export const AlertRulesTab = ({ showMessage }) => {
  const queryClient = useQueryClient();
  const [selectedEndpointFilter, setSelectedEndpointFilter] = useState('');

  // 10s auto-refresh for real-time rule state badges (ok <-> firing)
  const {
    data: rules = [],
    isLoading: loading,
    refetch: loadData,
  } = useQuery({
    queryKey: ['alertRules', selectedEndpointFilter],
    queryFn: () => fetchAlertRules(selectedEndpointFilter || null),
    refetchInterval: 10000,
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['alertChannels'],
    queryFn: fetchAlertChannels,
  });

  const { data: endpointsData = [] } = useQuery({
    queryKey: ['endpoints'],
    queryFn: fetchEndpoints,
  });
  const endpoints = Array.isArray(endpointsData) ? endpointsData : (endpointsData.endpoints || []);

  // Create Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [targetEndpointId, setTargetEndpointId] = useState('');
  const [targetChannelId, setTargetChannelId] = useState('');
  const [ruleType, setRuleType] = useState('consecutive_failures');
  const [cooldownMinutes, setCooldownMinutes] = useState(30);

  // Consecutive failures param
  const [consecutiveN, setConsecutiveN] = useState(5);

  // Failure rate params
  const [rateWindow, setRateWindow] = useState(15);
  const [ratePercent, setRatePercent] = useState(50);
  const [rateMinAttempts, setRateMinAttempts] = useState(10);

  const [creating, setCreating] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (endpoints.length > 0 && !targetEndpointId) {
      setTargetEndpointId(endpoints[0].id);
    }
  }, [endpoints, targetEndpointId]);

  useEffect(() => {
    if (channels.length > 0 && !targetChannelId) {
      setTargetChannelId(channels[0].id);
    }
  }, [channels, targetChannelId]);

  const handleCreateRule = async (e) => {
    e.preventDefault();
    if (!targetEndpointId) {
      showMessage?.('Please select a mailbox endpoint', 'error');
      return;
    }
    if (!targetChannelId) {
      showMessage?.('Please select an alert channel', 'error');
      return;
    }

    let params = {};
    if (ruleType === 'consecutive_failures') {
      params = { n: Number(consecutiveN) };
    } else if (ruleType === 'failure_rate') {
      params = {
        window_minutes: Number(rateWindow),
        percent: Number(ratePercent),
        min_attempts: Number(rateMinAttempts),
      };
    }

    setCreating(true);
    try {
      await createAlertRule({
        endpoint_id: targetEndpointId,
        channel_id: targetChannelId,
        type: ruleType,
        cooldown_minutes: Number(cooldownMinutes),
        params,
      });
      showMessage?.('Alert rule created successfully!');
      setShowAddModal(false);
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      queryClient.invalidateQueries({ queryKey: ['alertEvents'] });
    } catch (err) {
      showMessage?.(err.message || 'Failed to create alert rule', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleRule = async (rule) => {
    try {
      const updated = await updateAlertRule(rule.id, {
        enabled: !rule.enabled,
      });
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      queryClient.invalidateQueries({ queryKey: ['alertEvents'] });
      showMessage?.(
        `Rule for "${rule.endpoint_name}" is now ${updated.enabled ? 'Enabled' : 'Disabled'}.`
      );
    } catch (err) {
      showMessage?.(err.message || 'Failed to update rule', 'error');
    }
  };

  const handleDeleteRule = async () => {
    if (!ruleToDelete) return;
    setDeleting(true);
    try {
      await deleteAlertRule(ruleToDelete.id);
      showMessage?.('Alert rule deleted.');
      setRuleToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      queryClient.invalidateQueries({ queryKey: ['alertEvents'] });
    } catch (err) {
      showMessage?.(err.message || 'Failed to delete rule', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-50 to-rose-100/70 border border-rose-200/60 flex items-center justify-center text-rose-600 shrink-0 shadow-2xs mt-0.5">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 tracking-tight flex items-center gap-2">
              <span>Outage Detection &amp; Alert Rules</span>
              <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 max-w-xl leading-relaxed">
              Define automated rules that trigger one notification per outage, reminder intervals, and instant recovery alerts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {endpoints.length > 0 && (
            <select
              value={selectedEndpointFilter}
              onChange={(e) => setSelectedEndpointFilter(e.target.value)}
              className="text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-700 shadow-2xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Mailboxes</option>
              {endpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name || ep.slug}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 border border-gray-200/90 rounded-lg shadow-2xs transition-all disabled:opacity-50 cursor-pointer hover:border-gray-300"
            title="Refresh rules"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${loading ? 'animate-spin text-rose-600' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-xs hover:shadow transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Rule</span>
          </button>
        </div>
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-50 text-rose-600 mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-gray-900">No alert rules configured</h4>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-4">
            Create an outage rule on your mailbox to trigger Slack or Email alerts when consecutive failures occur.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Alert Rule</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((rule) => {
            const isFiring = rule.state === 'firing';
            const isEnabled = rule.enabled;

            return (
              <div
                key={rule.id}
                className={`rounded-xl border p-5 shadow-2xs transition-all flex flex-col justify-between ${
                  isFiring
                    ? 'bg-rose-50/40 border-rose-200 ring-1 ring-rose-200'
                    : isEnabled
                    ? 'bg-white border-gray-200 hover:shadow-xs'
                    : 'bg-gray-50 border-gray-200 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isFiring
                            ? 'bg-rose-100 text-rose-700 animate-pulse'
                            : isEnabled
                            ? 'bg-indigo-50 text-indigo-600'
                            : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {isFiring ? <Flame className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                          <span>{rule.endpoint_name}</span>
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                          <span className="font-mono text-gray-700 capitalize">
                            {rule.type.replace('_', ' ')}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            {rule.channel_type === 'slack' ? (
                              <Hash className="w-3.5 h-3.5 text-amber-600" />
                            ) : (
                              <Mail className="w-3.5 h-3.5 text-indigo-600" />
                            )}
                            <span>{rule.channel_name}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        status={isFiring ? 'failed' : isEnabled ? 'delivered' : 'neutral'}
                        label={isFiring ? 'FIRING' : isEnabled ? 'OK' : 'DISABLED'}
                      />
                    </div>
                  </div>

                  {/* Rule Details Description */}
                  <div className="mt-4 p-3 bg-white/80 rounded-lg border border-gray-100 text-xs text-gray-700 space-y-1">
                    {rule.type === 'consecutive_failures' && (
                      <div>
                        Triggers after <strong className="font-mono text-gray-900">{rule.params?.n || 5}</strong> consecutive delivery failures on this mailbox.
                      </div>
                    )}
                    {rule.type === 'failure_rate' && (
                      <div>
                        Triggers when failure rate exceeds <strong className="font-mono text-gray-900">{rule.params?.percent || 50}%</strong> over <strong className="font-mono text-gray-900">{rule.params?.window_minutes || 15}m</strong> (min {rule.params?.min_attempts || 10} attempts).
                      </div>
                    )}
                    {rule.type === 'dead_letter' && (
                      <div>
                        Dispatches a summary alert when any event reaches permanently failed status.
                      </div>
                    )}
                    <div className="text-[11px] text-gray-400 flex items-center gap-1 pt-1">
                      <Clock className="w-3 h-3" />
                      <span>Cooldown interval: {rule.cooldown_minutes} minutes between repeat notifications</span>
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleRule(rule)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                        isEnabled
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                      }`}
                      title={isEnabled ? 'Click to disable rule' : 'Click to enable rule'}
                    >
                      <Power className="w-3 h-3" />
                      <span>{isEnabled ? 'Active' : 'Paused'}</span>
                    </button>
                    {rule.last_notified_at && (
                      <span className="text-[11px] text-gray-400">
                        Last alert: {new Date(rule.last_notified_at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => setRuleToDelete(rule)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                    title="Delete rule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Alert Rule */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full p-6 text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <span>Create Mailbox Alert Rule</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 rounded-md p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4">
              {/* Select Mailbox Endpoint */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Target Webhook Mailbox
                </label>
                {endpoints.length === 0 ? (
                  <p className="text-xs text-amber-600">Please create an endpoint first.</p>
                ) : (
                  <select
                    value={targetEndpointId}
                    onChange={(e) => setTargetEndpointId(e.target.value)}
                    className="w-full text-xs bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    required
                  >
                    {endpoints.map((ep) => (
                      <option key={ep.id} value={ep.id}>
                        {ep.name ? `${ep.name} (/h/${ep.slug})` : `/h/${ep.slug}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Select Notification Channel */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Destination Channel
                </label>
                {channels.length === 0 ? (
                  <p className="text-xs text-amber-600">
                    No channels available. Add a Slack or Email channel first in the Notification Channels tab.
                  </p>
                ) : (
                  <select
                    value={targetChannelId}
                    onChange={(e) => setTargetChannelId(e.target.value)}
                    className="w-full text-xs bg-white border border-gray-300 rounded-lg p-2.5 text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    required
                  >
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        [{ch.type.toUpperCase()}] {ch.name} ({ch.hint})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Rule Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Trigger Condition Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'consecutive_failures', label: 'Consecutive' },
                    { id: 'failure_rate', label: 'Failure Rate' },
                    { id: 'dead_letter', label: 'Dead Letter' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setRuleType(t.id)}
                      className={`py-2 px-2 rounded-lg border text-xs font-medium text-center transition-colors cursor-pointer ${
                        ruleType === t.id
                          ? 'border-rose-600 bg-rose-50 text-rose-700 font-semibold shadow-2xs'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Params */}
              {ruleType === 'consecutive_failures' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Consecutive Failure Threshold (N)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={consecutiveN}
                    onChange={(e) => setConsecutiveN(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Fires when the last N attempts all fail. Recovers immediately on next success. Default is 5.
                  </p>
                </div>
              )}

              {ruleType === 'failure_rate' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Window (Minutes)
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max="1440"
                        value={rateWindow}
                        onChange={(e) => setRateWindow(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Failure % Threshold
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={ratePercent}
                        onChange={(e) => setRatePercent(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Minimum Attempts Required in Window
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="1000"
                      value={rateMinAttempts}
                      onChange={(e) => setRateMinAttempts(e.target.value)}
                      required
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Avoids false alarms during low traffic periods.
                    </p>
                  </div>
                </div>
              )}

              {ruleType === 'dead_letter' && (
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
                  Sends an outage summary whenever a delivery permanently fails after exhausting all retry backoffs.
                </div>
              )}

              {/* Cooldown */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Reminder Cooldown (Minutes)
                </label>
                <Input
                  type="number"
                  min="1"
                  max="1440"
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(e.target.value)}
                  required
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Prevents spam: repeated reminders are withheld until this cooldown has elapsed. Default is 30m.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={creating || channels.length === 0 || endpoints.length === 0}
                >
                  {creating ? 'Saving Rule...' : 'Create Alert Rule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Rule Confirmation Modal */}
      {ruleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full p-6 text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Delete Alert Rule?</h3>
                <p className="text-xs text-gray-500">This will remove automatic notifications for this condition.</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 mb-4">
              Are you sure you want to delete the <strong>{ruleToDelete.type.replace('_', ' ')}</strong> alert rule on <strong>{ruleToDelete.endpoint_name}</strong>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRuleToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <button
                onClick={handleDeleteRule}
                disabled={deleting}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertRulesTab;
