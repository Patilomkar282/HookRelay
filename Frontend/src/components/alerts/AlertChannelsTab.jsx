import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAlertChannels,
  createAlertChannel,
  testAlertChannel,
  verifyAlertChannel,
  deleteAlertChannel,
} from '../../api/client';
import Button from '../common/Button';
import Input from '../common/Input';
import Badge from '../common/Badge';
import {
  Bell,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  AlertCircle,
  Mail,
  Hash,
  X,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Lock,
  Clock,
} from 'lucide-react';

export const AlertChannelsTab = ({ user, showMessage }) => {
  const queryClient = useQueryClient();

  const {
    data: channels = [],
    isLoading: loading,
    refetch: loadChannels,
  } = useQuery({
    queryKey: ['alertChannels'],
    queryFn: fetchAlertChannels,
  });

  // Create Channel Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [channelType, setChannelType] = useState('slack'); // 'slack' | 'email'
  const [channelName, setChannelName] = useState('');
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [creating, setCreating] = useState(false);

  // Test state: channelId -> { testing: boolean, result: string, success: boolean }
  const [testStatus, setTestStatus] = useState({});

  // Verify Modal state
  const [verifyModalChannel, setVerifyModalChannel] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Delete confirmation modal state
  const [channelToDelete, setChannelToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (!channelName.trim()) {
      showMessage?.('Channel name is required', 'error');
      return;
    }

    if (channelType === 'slack') {
      const url = slackWebhookUrl.trim();
      if (!url) {
        showMessage?.('Slack webhook URL is required', 'error');
        return;
      }
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') {
          showMessage?.('Slack webhook URL must use HTTPS', 'error');
          return;
        }
        if (parsed.hostname.toLowerCase() !== 'hooks.slack.com') {
          showMessage?.('Slack webhook URL hostname must be exactly hooks.slack.com', 'error');
          return;
        }
      } catch {
        showMessage?.('Please provide a valid URL', 'error');
        return;
      }
    }

    setCreating(true);
    try {
      await createAlertChannel({
        type: channelType,
        name: channelName.trim(),
        webhook_url: channelType === 'slack' ? slackWebhookUrl.trim() : null,
      });
      showMessage?.(`Alert channel "${channelName}" created successfully!`);
      setShowAddModal(false);
      setChannelName('');
      setSlackWebhookUrl('');
      queryClient.invalidateQueries({ queryKey: ['alertChannels'] });
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
    } catch (err) {
      showMessage?.(err.message || 'Failed to create alert channel', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleTestChannel = async (channel) => {
    setTestStatus((prev) => ({
      ...prev,
      [channel.id]: { testing: true, result: null },
    }));

    try {
      const res = await testAlertChannel(channel.id);
      setTestStatus((prev) => ({
        ...prev,
        [channel.id]: {
          testing: false,
          result: res.message || (res.success ? 'Test message sent' : 'Failed'),
          success: res.success,
        },
      }));

      if (res.success) {
        showMessage?.(res.message || 'Test message dispatched successfully!');
        if (res.needs_verification) {
          // Open code verification modal for email
          setVerifyModalChannel(channel);
          setVerifyCode('');
        } else {
          loadChannels();
        }
      } else {
        showMessage?.(res.error || 'Test delivery failed', 'error');
      }
    } catch (err) {
      setTestStatus((prev) => ({
        ...prev,
        [channel.id]: {
          testing: false,
          result: err.message,
          success: false,
        },
      }));
      showMessage?.(err.message || 'Failed to test channel', 'error');
    }
  };

  const handleVerifyChannel = async (e) => {
    e.preventDefault();
    if (!verifyCode.trim()) {
      showMessage?.('Please enter the 6-digit verification code', 'error');
      return;
    }

    setVerifying(true);
    try {
      await verifyAlertChannel({
        id: verifyModalChannel.id,
        code: verifyCode.trim(),
      });
      showMessage?.('Email channel successfully verified!');
      setVerifyModalChannel(null);
      setVerifyCode('');
      queryClient.invalidateQueries({ queryKey: ['alertChannels'] });
    } catch (err) {
      showMessage?.(err.message || 'Verification failed. Please check the code.', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!channelToDelete) return;
    setDeleting(true);
    try {
      await deleteAlertChannel(channelToDelete.id);
      showMessage?.(`Channel "${channelToDelete.name}" and its associated rules were removed.`);
      setChannelToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['alertChannels'] });
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      queryClient.invalidateQueries({ queryKey: ['alertEvents'] });
    } catch (err) {
      showMessage?.(err.message || 'Failed to delete channel', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/70 border border-indigo-200/60 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs mt-0.5">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 tracking-tight flex items-center gap-2">
              <span>Notification &amp; Alert Channels</span>
              <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {channels.length} {channels.length === 1 ? 'channel' : 'channels'}
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 max-w-xl leading-relaxed">
              Connect Slack webhooks or email destinations to receive real-time outage alerts and recovery notices.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={loadChannels}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 border border-gray-200/90 rounded-lg shadow-2xs transition-all disabled:opacity-50 cursor-pointer hover:border-gray-300"
            title="Refresh channels"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-xs hover:shadow transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Channel</span>
          </button>
        </div>
      </div>

      {/* Channels List */}
      {channels.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 mb-3">
            <Bell className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-gray-900">No alert channels configured</h4>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-4">
            Add a Slack Incoming Webhook or connect your registered email address to be notified when your mailboxes fail.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Notification Channel</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channels.map((ch) => {
            const isSlack = ch.type === 'slack';
            const isVerified = !!ch.verified_at;
            const currentTest = testStatus[ch.id];

            return (
              <div
                key={ch.id}
                className="bg-white rounded-xl border border-gray-200/90 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                          isSlack
                            ? 'bg-amber-50/80 text-amber-600 border-amber-200/60'
                            : 'bg-indigo-50/80 text-indigo-600 border-indigo-200/60'
                        }`}
                      >
                        {isSlack ? <Hash className="w-5 h-5" /> : <Mail className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                          {ch.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-gray-600 bg-gray-100/80 px-2 py-0.5 rounded-md border border-gray-200/50">
                            <Lock className="w-2.5 h-2.5 text-gray-400" />
                            {ch.hint}
                          </span>
                          <span className="text-xs text-gray-400 capitalize font-medium">• {ch.type}</span>
                        </div>
                      </div>
                    </div>

                    {isVerified ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/70 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/70 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Unverified
                      </span>
                    )}
                  </div>

                  <div className="mt-3.5 text-[11px] text-gray-400 flex items-center gap-2">
                    <Clock className="w-3 h-3 text-gray-300" />
                    <span>Added {new Date(ch.created_at).toLocaleDateString()}</span>
                    {ch.verified_at && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span className="text-emerald-600/80 font-medium">
                          Verified {new Date(ch.verified_at).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Inline Test Result */}
                  {currentTest && !currentTest.testing && (
                    <div
                      className={`mt-3 px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 border shadow-2xs ${
                        currentTest.success
                          ? 'bg-emerald-50/90 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50/90 text-rose-800 border-rose-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {currentTest.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        )}
                        <span className="font-medium truncate">{currentTest.result}</span>
                      </div>
                      <button
                        onClick={() => setTestStatus((prev) => ({ ...prev, [ch.id]: null }))}
                        className="text-gray-400 hover:text-gray-600 text-xs ml-1 shrink-0 p-0.5 rounded"
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="mt-5 pt-3.5 border-t border-gray-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTestChannel(ch)}
                      disabled={currentTest?.testing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 border border-gray-200 shadow-2xs hover:border-gray-300 transition-all disabled:opacity-50 cursor-pointer"
                      title="Send a live test alert to verify delivery"
                    >
                      <Send className={`w-3.5 h-3.5 text-indigo-600 ${currentTest?.testing ? 'animate-pulse' : ''}`} />
                      <span>{currentTest?.testing ? 'Sending...' : 'Test Alert'}</span>
                    </button>

                    {!isVerified && !isSlack && (
                      <button
                        onClick={() => {
                          setVerifyModalChannel(ch);
                          setVerifyCode('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-800 bg-amber-100/70 hover:bg-amber-200/70 border border-amber-300/60 shadow-2xs transition-all cursor-pointer"
                        title="Enter verification code from test email"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                        <span>Enter Code</span>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => setChannelToDelete(ch)}
                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete channel"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Security Privacy Notice */}
      <div className="bg-emerald-50/40 rounded-xl border border-emerald-200/60 p-4 text-xs text-emerald-900/80 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold text-emerald-950">Zero-Trust Credential Security: </span>
          All Slack incoming webhook URLs are encrypted in the database using 256-bit Fernet symmetric keys. Webhook secrets are never logged, never returned over API endpoints, and only masked 4-character hints are accessible.
        </div>
      </div>

      {/* Modal: Add Alert Channel */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full p-6 text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-600" />
                <span>Add Notification Channel</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 rounded-md p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateChannel} className="space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Channel Destination Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChannelType('slack')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      channelType === 'slack'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 font-semibold shadow-2xs'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    <Hash className="w-4 h-4 text-amber-600" />
                    <span>Slack Webhook</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChannelType('email')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      channelType === 'email'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 font-semibold shadow-2xs'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    <Mail className="w-4 h-4 text-indigo-600" />
                    <span>Account Email</span>
                  </button>
                </div>
              </div>

              {/* Channel Friendly Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Channel Label / Name
                </label>
                <Input
                  type="text"
                  placeholder={channelType === 'slack' ? '#dev-alerts or Critical Slack' : 'Dev Team Primary Email'}
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  required
                />
              </div>

              {/* Slack Webhook Input */}
              {channelType === 'slack' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      Slack Incoming Webhook URL
                    </label>
                    <span className="text-[11px] text-gray-400 font-mono">https://hooks.slack.com/...</span>
                  </div>
                  <Input
                    type="password"
                    placeholder="https://hooks.slack.com/services/T000/B000/••••••••"
                    value={slackWebhookUrl}
                    onChange={(e) => setSlackWebhookUrl(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Must strictly use HTTPS and the <code className="text-indigo-600 font-mono">hooks.slack.com</code> domain.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-3 text-xs text-indigo-900">
                  <div className="font-semibold flex items-center gap-1.5 mb-1">
                    <Mail className="w-3.5 h-3.5" />
                    <span>Delivered to: {user?.email}</span>
                  </div>
                  <p className="text-indigo-700 text-[11px] leading-relaxed">
                    To prevent unsolicited relays, alert emails are delivered exclusively to your verified HookRelay account email address.
                  </p>
                </div>
              )}

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
                  disabled={creating}
                >
                  {creating ? 'Adding Channel...' : 'Save Channel'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Email Verification Code Entry */}
      {verifyModalChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-sm w-full p-6 text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>Verify Email Channel</span>
              </h3>
              <button
                onClick={() => setVerifyModalChannel(null)}
                className="text-gray-400 hover:text-gray-600 rounded-md p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600 mb-3">
              We dispatched a confirmation code to <strong>{user?.email}</strong>. Enter the 6-digit code below to complete verification:
            </p>

            <form onSubmit={handleVerifyChannel} className="space-y-4">
              <div>
                <Input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  className="text-center font-mono text-lg tracking-widest font-bold"
                  autoFocus
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVerifyModalChannel(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={verifying}
                >
                  {verifying ? 'Verifying...' : 'Confirm Verification'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirmation */}
      {channelToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full p-6 text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Delete Notification Channel?</h3>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 mb-4">
              Are you sure you want to delete <strong>"{channelToDelete.name}"</strong>? Any active alert rules tied to this channel will also be permanently deleted.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setChannelToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <button
                onClick={handleDeleteChannel}
                disabled={deleting}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Channel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertChannelsTab;
