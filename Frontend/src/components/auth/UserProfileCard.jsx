import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import Button from '../common/Button';
import Input from '../common/Input';
import Badge from '../common/Badge';
import {
  updateProfileApi,
  changePasswordApi,
  fetchApiKeys,
  createApiKey,
  deleteApiKey,
  purgeEventsApi,
  deleteAccountApi,
  fetchHealth,
} from '../../api/client';
import {
  User,
  Key,
  Sliders,
  AlertTriangle,
  Copy,
  Check,
  Plus,
  Trash2,
  Shield,
  Cpu,
  Database,
  Lock,
  RotateCw,
  Terminal,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Activity,
  Server,
  Zap,
  Mail,
  ShieldCheck,
} from 'lucide-react';

export const UserProfileCard = () => {
  const { user, logout, refreshUser } = useAuth();

  // Active settings tab: 'profile' | 'apikeys' | 'delivery' | 'danger'
  const [activeTab, setActiveTab] = useState('profile');

  // Architecture & Health modal state
  const [showArchModal, setShowArchModal] = useState(false);
  const [systemHealth, setSystemHealth] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  // Status message banners
  const [banner, setBanner] = useState(null); // { type: 'success' | 'error', message: '' }

  const showMessage = (message, type = 'success') => {
    setBanner({ message, type });
    setTimeout(() => setBanner(null), 4000);
  };

  // ==========================================
  // TAB 1: Profile & Password State
  // ==========================================
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      showMessage('Email address is required.', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfileApi({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
      });
      await refreshUser();
      showMessage('Profile information updated successfully!');
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showMessage('New password must be at least 6 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage('New passwords do not match.', 'error');
      return;
    }

    setChangingPassword(true);
    try {
      await changePasswordApi({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showMessage('Password updated successfully!');
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  // ==========================================
  // TAB 2: API Keys State
  // ==========================================
  const [apiKeys, setApiKeys] = useState([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdKeySecret, setCreatedKeySecret] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState(null);
  const [revokingKey, setRevokingKey] = useState(false);
  const [snippetLang, setSnippetLang] = useState('curl');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const loadApiKeys = async () => {
    setLoadingKeys(true);
    try {
      const keys = await fetchApiKeys();
      setApiKeys(keys);
    } catch (err) {
      console.error('Failed to load API keys:', err);
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'apikeys') {
      loadApiKeys();
    }
  }, [activeTab]);

  const handleCreateApiKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const res = await createApiKey(newKeyName.trim());
      setCreatedKeySecret(res.key);
      setNewKeyName('');
      loadApiKeys();
      showMessage('Personal API key generated successfully!');
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!keyToRevoke) return;
    setRevokingKey(true);
    try {
      await deleteApiKey(keyToRevoke.id);
      setKeyToRevoke(null);
      loadApiKeys();
      showMessage('API key has been revoked and can no longer be used.');
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setRevokingKey(false);
    }
  };

  const handleCopyNewKey = () => {
    if (!createdKeySecret) return;
    navigator.clipboard.writeText(createdKeySecret);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Integration snippets
  const getCodeSnippet = () => {
    if (snippetLang === 'curl') {
      return `curl -X GET "http://localhost:8000/endpoints" \\
  -H "Authorization: Bearer hr_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json"`;
    }
    if (snippetLang === 'python') {
      return `import requests

# Authenticate with your HookRelay API key
headers = {
    "Authorization": "Bearer hr_live_YOUR_API_KEY",
    "Content-Type": "application/json"
}

response = requests.get("http://localhost:8000/endpoints", headers=headers)
print(response.json())`;
    }
    if (snippetLang === 'nodejs') {
      return `// Using standard fetch in Node.js 18+
const res = await fetch("http://localhost:8000/endpoints", {
  headers: {
    "Authorization": "Bearer hr_live_YOUR_API_KEY",
    "Content-Type": "application/json"
  }
});
const mailboxes = await res.json();
console.log(mailboxes);`;
    }
    return '';
  };

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(getCodeSnippet());
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  // ==========================================
  // TAB 3: Delivery Defaults & Settings State
  // ==========================================
  const [retryAttempts, setRetryAttempts] = useState(user?.retry_attempts ?? 3);
  const [deliveryTimeout, setDeliveryTimeout] = useState(user?.delivery_timeout ?? 15);
  const [emailAlerts, setEmailAlerts] = useState(user?.email_alerts ?? true);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (user) {
      setRetryAttempts(user.retry_attempts ?? 3);
      setDeliveryTimeout(user.delivery_timeout ?? 15);
      setEmailAlerts(user.email_alerts ?? true);
    }
  }, [user]);

  const handleSaveDeliverySettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await updateProfileApi({
        retry_attempts: parseInt(retryAttempts, 10),
        delivery_timeout: parseInt(deliveryTimeout, 10),
        email_alerts: Boolean(emailAlerts),
      });
      await refreshUser();
      showMessage('Delivery preferences saved successfully!');
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  // ==========================================
  // TAB 4: Danger Zone State
  // ==========================================
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgingEvents, setPurgingEvents] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handlePurgeEvents = async () => {
    setPurgingEvents(true);
    try {
      const res = await purgeEventsApi();
      setShowPurgeModal(false);
      showMessage(res.message || 'All event logs and delivery history purged.');
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setPurgingEvents(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (!deletePassword) {
      showMessage('Password is required to delete account.', 'error');
      return;
    }
    setDeletingAccount(true);
    try {
      await deleteAccountApi(deletePassword);
      setShowDeleteModal(false);
      logout();
    } catch (err) {
      showMessage(err.message, 'error');
      setDeletingAccount(false);
    }
  };

  // System Architecture & Health loader
  const handleOpenArchModal = async () => {
    setShowArchModal(true);
    setLoadingHealth(true);
    try {
      const health = await fetchHealth();
      setSystemHealth(health);
    } catch (err) {
      console.warn('Failed to load system health:', err.message);
    } finally {
      setLoadingHealth(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Top Banner Message */}
      {banner && (
        <div
          className={`p-4 rounded-lg border text-xs font-medium flex items-center justify-between transition-all ${
            banner.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{banner.message}</span>
          </div>
          <button
            onClick={() => setBanner(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Account Overview Header Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900">
                {user?.full_name ? `${user.full_name} (${user.email})` : user?.email}
              </h2>
              <Badge status="delivered" label="Active User" />
            </div>
            <p className="text-xs text-gray-500 font-mono mt-1">
              Account ID: <span className="text-gray-700">{user?.id}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenArchModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors shadow-2xs"
              title="Inspect backend architectural specifications and platform status"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-500" />
              <span>System Specs &amp; Health</span>
            </button>
            <div className="text-xs text-gray-500 font-mono sm:text-right hidden md:block">
              <div>Member since</div>
              <div className="text-gray-800 font-medium">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Active'}
              </div>
            </div>
          </div>
        </div>

        {/* Settings Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-6">
          <button
            onClick={() => setActiveTab('profile')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'profile'
                ? 'bg-gray-900 text-white shadow-xs font-semibold'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Profile &amp; Password</span>
          </button>

          <button
            onClick={() => setActiveTab('apikeys')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'apikeys'
                ? 'bg-gray-900 text-white shadow-xs font-semibold'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>API Keys</span>
          </button>

          <button
            onClick={() => setActiveTab('delivery')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'delivery'
                ? 'bg-gray-900 text-white shadow-xs font-semibold'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Delivery Defaults</span>
          </button>

          <button
            onClick={() => setActiveTab('danger')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'danger'
                ? 'bg-red-50 text-red-700 border border-red-200 font-semibold'
                : 'text-gray-600 hover:text-red-600 hover:bg-red-50/50'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span>Danger Zone</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: Profile & Password                                 */}
      {/* ========================================================= */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Profile Details Form */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Personal Information</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Update your display name and contact email for notifications and audit logs.
              </p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 pt-2">
              <Input
                label="Email Address"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                helperText="Primary email used for account authentication, failure alerts, and audit logs."
              />

              <Input
                label="Full Name"
                placeholder="e.g. Omkar Patil"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                helperText="Used across team notifications and webhook audit events."
              />

              <div className="pt-2">
                <Button type="submit" variant="primary" size="md" isLoading={savingProfile}>
                  Save Profile Changes
                </Button>
              </div>
            </form>
          </div>

          {/* Change Password Form */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Change Password</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Ensure your account is protected using a strong, unique password.
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4 pt-2">
              <Input
                label="Current Password"
                type="password"
                required
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />

              <Input
                label="New Password"
                type="password"
                required
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                helperText="Must be at least 6 characters long."
              />

              <Input
                label="Confirm New Password"
                type="password"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />

              <div className="pt-2">
                <Button type="submit" variant="primary" size="md" isLoading={changingPassword}>
                  Update Password
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: Personal API Keys                                  */}
      {/* ========================================================= */}
      {activeTab === 'apikeys' && (
        <div className="space-y-6">
          {/* Key creation & info box */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Personal API Keys</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Generate secret API keys (<code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded font-mono text-[11px]">hr_live_...</code>) to authenticate automated webhook ingestion, Python SDKs, CLI tools, and CI/CD pipelines.
              </p>
            </div>

            {/* Creation Form */}
            <form onSubmit={handleCreateApiKey} className="flex flex-col sm:flex-row gap-3 pt-2">
              <div className="flex-1">
                <Input
                  placeholder="Key label (e.g. GitHub Actions CI, Stripe Forwarder, Staging Daemon)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" variant="primary" size="md" icon={Plus} isLoading={creatingKey}>
                Generate New Key
              </Button>
            </form>

            {/* Revealed Key Banner (only shown once right after generation) */}
            {createdKeySecret && (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs space-y-2">
                <div className="flex items-center justify-between font-semibold text-amber-900">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>Copy your new personal API key</span>
                  </div>
                  <button
                    onClick={() => setCreatedKeySecret(null)}
                    className="text-amber-700 hover:text-amber-900"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-amber-700 text-[11px]">
                  Make sure to copy your key now. For your security, this key cannot be shown again once you leave or refresh this page.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 p-2 bg-white border border-amber-300 rounded font-mono text-xs text-gray-900 select-all truncate">
                    {createdKeySecret}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyNewKey}
                    icon={copiedKey ? Check : Copy}
                  >
                    {copiedKey ? 'Copied' : 'Copy Key'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Active API Keys List */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-xs">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-gray-500" />
                <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                  Active API Keys ({apiKeys.length})
                </h4>
              </div>
              <button
                onClick={loadApiKeys}
                className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
              >
                <RotateCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            {loadingKeys ? (
              <div className="p-8 text-center text-xs text-gray-500">Loading API keys...</div>
            ) : apiKeys.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500 space-y-1">
                <p className="font-medium text-gray-700">No personal API keys generated yet.</p>
                <p>Create a key above to authenticate programmatic API calls and CLI integrations.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {apiKeys.map((k) => (
                  <div
                    key={k.id}
                    className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/60 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900">{k.name}</span>
                        <code className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono">
                          {k.key_prefix}
                        </code>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>Created: {new Date(k.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>
                          Last used:{' '}
                          {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setKeyToRevoke(k)}
                        icon={Trash2}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Interactive Integration Snippets */}
          <div className="bg-gray-900 text-white rounded-lg p-5 shadow-xs space-y-3 font-mono text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-sans">
              <span className="text-gray-200 font-semibold text-xs flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Programmatic Usage &amp; Authentication Examples</span>
              </span>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-gray-800 p-0.5 rounded text-[11px]">
                  <button
                    onClick={() => setSnippetLang('curl')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      snippetLang === 'curl' ? 'bg-gray-700 text-white font-medium' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    cURL
                  </button>
                  <button
                    onClick={() => setSnippetLang('python')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      snippetLang === 'python' ? 'bg-gray-700 text-white font-medium' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Python
                  </button>
                  <button
                    onClick={() => setSnippetLang('nodejs')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      snippetLang === 'nodejs' ? 'bg-gray-700 text-white font-medium' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Node.js
                  </button>
                </div>

                <button
                  onClick={handleCopySnippet}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] transition-colors"
                >
                  {copiedSnippet ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-gray-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <pre className="overflow-x-auto text-emerald-300 bg-gray-950 p-3.5 rounded border border-gray-800 text-[11px] leading-relaxed">
              {getCodeSnippet()}
            </pre>
            <p className="text-[11px] text-gray-400 font-sans">
              Both <code className="text-gray-200 font-mono">Authorization: Bearer hr_live_...</code> and <code className="text-gray-200 font-mono">X-API-Key: hr_live_...</code> headers are supported.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: Delivery Defaults & Alerts                         */}
      {/* ========================================================= */}
      {activeTab === 'delivery' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Global Delivery &amp; Retry Preferences</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Configure default exponential backoff policies, delivery timeouts, and failure alerting rules across all your webhook mailboxes.
            </p>
          </div>

          <form onSubmit={handleSaveDeliverySettings} className="space-y-6 pt-2">
            {/* Retry attempts */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900 block">
                    Maximum Delivery Retries
                  </label>
                  <span className="text-xs text-gray-500">
                    Number of automatic re-attempts using exponential backoff with jitter.
                  </span>
                </div>
                <span className="text-xs font-semibold text-gray-900 font-mono bg-gray-100 px-2.5 py-1 rounded border border-gray-200">
                  {retryAttempts} {retryAttempts === 1 ? 'attempt' : 'attempts'}
                </span>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] text-gray-400 font-medium">Quick Presets:</span>
                {[
                  { value: 1, label: '1 (No Retries)' },
                  { value: 3, label: '3 (Standard)' },
                  { value: 5, label: '5 (Resilient)' },
                  { value: 10, label: '10 (Aggressive)' },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setRetryAttempts(preset.value)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      Number(retryAttempts) === preset.value
                        ? 'bg-gray-900 text-white font-medium'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <input
                type="range"
                min="1"
                max="10"
                value={retryAttempts}
                onChange={(e) => setRetryAttempts(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
              />

              <div className="p-3 bg-gray-50 rounded border border-gray-100 text-[11px] text-gray-600 leading-relaxed">
                When a target endpoint fails (HTTP 4xx/5xx or timeout), the delivery dispatcher retries with progressive intervals (1m, 5m, 30m, 2h) up to <strong>{retryAttempts} times</strong> before marking the event as permanently failed.
              </div>
            </div>

            {/* Timeout */}
            <div className="space-y-3 border-t border-gray-100 pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900 block">
                    Delivery Connection Timeout
                  </label>
                  <span className="text-xs text-gray-500">
                    Maximum time HookRelay waits for your destination HTTP server to reply.
                  </span>
                </div>
                <span className="text-xs font-semibold text-gray-900 font-mono bg-gray-100 px-2.5 py-1 rounded border border-gray-200">
                  {deliveryTimeout} seconds
                </span>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] text-gray-400 font-medium">Quick Presets:</span>
                {[
                  { value: 5, label: '5s (Fast)' },
                  { value: 10, label: '10s (Default)' },
                  { value: 15, label: '15s (Recommended)' },
                  { value: 30, label: '30s' },
                  { value: 60, label: '60s (Max)' },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setDeliveryTimeout(preset.value)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      Number(deliveryTimeout) === preset.value
                        ? 'bg-gray-900 text-white font-medium'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <input
                type="range"
                min="5"
                max="60"
                step="5"
                value={deliveryTimeout}
                onChange={(e) => setDeliveryTimeout(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
              />

              <div className="p-3 bg-gray-50 rounded border border-gray-100 text-[11px] text-gray-600 leading-relaxed">
                Outbound HTTP requests to your target endpoints will be aborted if a response is not received within <strong>{deliveryTimeout} seconds</strong>.
              </div>
            </div>

            {/* Email alerts */}
            <div className="border-t border-gray-100 pt-5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailAlerts}
                  onChange={(e) => setEmailAlerts(e.target.checked)}
                  className="mt-1 w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900 block">
                    Endpoint Outage Email Notifications
                  </span>
                  <span className="text-xs text-gray-500 block mt-0.5 leading-relaxed">
                    Automatically receive email notifications when a target webhook endpoint encounters consecutive delivery errors or persistent HTTP 5xx responses.
                  </span>
                </div>
              </label>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <Button type="submit" variant="primary" size="md" isLoading={savingSettings}>
                Save Delivery Preferences
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: Danger Zone                                        */}
      {/* ========================================================= */}
      {activeTab === 'danger' && (
        <div className="space-y-6">
          <div className="border border-red-200 bg-red-50/30 rounded-lg p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-red-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Danger Zone</span>
              </h3>
              <p className="text-xs text-red-700 mt-1">
                Irreversible actions that purge event data or permanently close your account.
              </p>
            </div>

            {/* Action 1: Purge Event Logs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-md bg-white border border-red-200">
              <div className="space-y-0.5">
                <h4 className="text-sm font-semibold text-gray-900">Purge All Webhook Event Logs</h4>
                <p className="text-xs text-gray-500">
                  Wipe all captured webhook payloads and delivery histories across all mailboxes. Endpoints and credentials remain intact.
                </p>
              </div>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowPurgeModal(true)}
                className="text-red-700 hover:text-red-800 border-red-300 hover:bg-red-50 shrink-0"
              >
                Purge Event Logs
              </Button>
            </div>

            {/* Action 2: Delete Account */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-md bg-white border border-red-200">
              <div className="space-y-0.5">
                <h4 className="text-sm font-semibold text-gray-900">Delete Account &amp; All Data</h4>
                <p className="text-xs text-gray-500">
                  Permanently erase your HookRelay account, all webhook mailboxes, API keys, and event data. This cannot be undone.
                </p>
              </div>
              <Button
                variant="danger"
                size="md"
                onClick={() => setShowDeleteModal(true)}
                className="shrink-0"
              >
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: Revoke API Key Confirmation                        */}
      {/* ========================================================= */}
      {keyToRevoke && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Revoke API Key</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to permanently revoke the API key labeled <strong>"{keyToRevoke.name}"</strong>? Any services, scripts, or CI/CD pipelines currently using this key will immediately be rejected.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="md" onClick={() => setKeyToRevoke(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={handleConfirmRevoke}
                isLoading={revokingKey}
              >
                Revoke Key
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: Purge Events Confirmation                         */}
      {/* ========================================================= */}
      {showPurgeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Confirm Event Purge</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to delete all captured webhook events and delivery records? This cannot be undone. Your configured mailboxes and API keys will remain active.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="md" onClick={() => setShowPurgeModal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={handlePurgeEvents}
                isLoading={purgingEvents}
              >
                Yes, Purge Events
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: Delete Account Confirmation                        */}
      {/* ========================================================= */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Delete HookRelay Account</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              This action is permanent and immediate. All mailboxes, events, and API keys will be erased.
              Please confirm your current password to proceed:
            </p>
            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <Input
                label="Confirm Password"
                type="password"
                required
                placeholder="••••••••"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deletingAccount}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  size="md"
                  isLoading={deletingAccount}
                >
                  Permanently Delete
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: System Specs & Platform Architecture                */}
      {/* (Clean portfolio showcase without raw debug buttons)      */}
      {/* ========================================================= */}
      {showArchModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-gray-900">
                  System Architecture &amp; Platform Health
                </h3>
              </div>
              <button
                onClick={() => setShowArchModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Platform Health Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-900 mb-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Ingestion Engine</span>
                </div>
                <p className="font-medium text-emerald-950">99.9% Uptime SLA</p>
                <p className="text-emerald-700 text-[11px] mt-0.5">Sub-10ms response latency</p>
              </div>

              <div className="p-3.5 rounded-lg bg-indigo-50 border border-indigo-200">
                <div className="flex items-center gap-1.5 font-semibold text-indigo-900 mb-1">
                  <Zap className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Delivery Dispatcher</span>
                </div>
                <p className="font-medium text-indigo-950">Active Worker Loop</p>
                <p className="text-indigo-700 text-[11px] mt-0.5">SKIP LOCKED queue processing</p>
              </div>

              <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200">
                <div className="flex items-center gap-1.5 font-semibold text-gray-900 mb-1">
                  <Activity className="w-3.5 h-3.5 text-gray-600" />
                  <span>Real-Time Stream</span>
                </div>
                <p className="font-medium text-gray-900">WebSocket Connected</p>
                <p className="text-gray-500 text-[11px] mt-0.5">Live event telemetry feed</p>
              </div>
            </div>

            {/* Architectural Pillars */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200">
                <div className="flex items-center gap-1.5 font-semibold text-gray-900 mb-1">
                  <Database className="w-4 h-4 text-gray-600" />
                  <span>Database</span>
                </div>
                <p className="font-medium text-gray-900">PostgreSQL 18</p>
                <p className="text-gray-500 text-[11px] mt-0.5">Asyncpg connection pool</p>
              </div>

              <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200">
                <div className="flex items-center gap-1.5 font-semibold text-gray-900 mb-1">
                  <Lock className="w-4 h-4 text-gray-600" />
                  <span>Credential Security</span>
                </div>
                <p className="font-medium text-gray-900">Bcrypt Salted &amp; SHA-256</p>
                <p className="text-gray-500 text-[11px] mt-0.5">Truncated at 72 bytes</p>
              </div>

              <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200">
                <div className="flex items-center gap-1.5 font-semibold text-gray-900 mb-1">
                  <ShieldCheck className="w-4 h-4 text-gray-600" />
                  <span>Session &amp; API Auth</span>
                </div>
                <p className="font-medium text-gray-900">JWT &amp; Bearer Keys</p>
                <p className="text-gray-500 text-[11px] mt-0.5">Stateless + Hashed API keys</p>
              </div>
            </div>

            {/* Policies */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                <span className="font-semibold text-gray-900 block mb-0.5">SSRF Protection</span>
                <p className="text-gray-500 text-[11px]">
                  Private subnets (RFC 1918) and cloud metadata services blocked on outbound delivery.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                <span className="font-semibold text-gray-900 block mb-0.5">Sliding Rate Limiter</span>
                <p className="text-gray-500 text-[11px]">
                  120 req/min per IP threshold on public ingestion routes returning HTTP 429.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button variant="secondary" size="md" onClick={() => setShowArchModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfileCard;
