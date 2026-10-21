import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Button from '../common/Button';
import Badge from '../common/Badge';
import {
  Copy,
  Check,
  RotateCw,
  Database,
  Lock,
  Key,
} from 'lucide-react';

export const UserProfileCard = () => {
  const { user, token, testMe } = useAuth();
  const [copied, setCopied] = useState(false);
  const [meResult, setMeResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const handleCopyToken = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestMe = async () => {
    setVerifying(true);
    try {
      const res = await testMe();
      setMeResult({ success: true, data: res });
    } catch (err) {
      setMeResult({ success: false, error: err.message });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Account Info Box */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900">{user?.email}</h2>
              <Badge status="delivered" label="Active User" />
            </div>
            <p className="text-xs text-gray-500 font-mono mt-1">
              User ID: <span className="text-gray-700">{user?.id}</span>
            </p>
          </div>

          <div className="text-xs text-gray-500 font-mono sm:text-right">
            <div>Member since</div>
            <div className="text-gray-800 font-medium">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Just now'}
            </div>
          </div>
        </div>

        {/* 3-Pillar Foundation Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
          <div className="p-4 rounded-md bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900 mb-1">
              <Database className="w-4 h-4 text-gray-600" />
              <span>Database</span>
            </div>
            <p className="text-sm font-medium text-gray-900">PostgreSQL 18</p>
            <p className="text-xs text-gray-500 mt-0.5">Asyncpg connection active</p>
          </div>

          <div className="p-4 rounded-md bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900 mb-1">
              <Lock className="w-4 h-4 text-gray-600" />
              <span>Security</span>
            </div>
            <p className="text-sm font-medium text-gray-900">Bcrypt Salted</p>
            <p className="text-xs text-gray-500 mt-0.5">Truncated at 72 bytes</p>
          </div>

          <div className="p-4 rounded-md bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900 mb-1">
              <Key className="w-4 h-4 text-gray-600" />
              <span>Session Auth</span>
            </div>
            <p className="text-sm font-medium text-gray-900">JWT (HS256)</p>
            <p className="text-xs text-gray-500 mt-0.5">Stateless 24h token</p>
          </div>
        </div>
      </div>

      {/* Bearer Token & Live Endpoint Verification */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Bearer Token</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Attached automatically as <code className="text-gray-800 font-mono bg-gray-100 px-1 py-0.5 rounded">Authorization: Bearer &lt;token&gt;</code> on authenticated requests.
          </p>
        </div>

        {/* Truncated Copyable Token */}
        <div className="flex items-center gap-2">
          <div className="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-md font-mono text-xs text-gray-600 truncate select-all">
            {token ? `${token.substring(0, 60)}...` : 'No token'}
          </div>
          <Button
            variant="secondary"
            size="md"
            onClick={handleCopyToken}
            icon={copied ? Check : Copy}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        {/* Live Verification Trigger */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-gray-100">
          <Button
            variant="primary"
            size="md"
            onClick={handleTestMe}
            isLoading={verifying}
            icon={RotateCw}
          >
            Call GET /auth/me
          </Button>
          <span className="text-xs text-gray-500">
            Validates JWT and reads user from PostgreSQL
          </span>
        </div>

        {/* Response Viewer */}
        {meResult && (
          <div
            className={`p-4 rounded-md border text-xs font-mono transition-colors ${
              meResult.success
                ? 'bg-emerald-50/60 border-emerald-200 text-gray-900'
                : 'bg-red-50/60 border-red-200 text-gray-900'
            }`}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200 font-sans">
              <span className="font-semibold text-gray-900 text-xs">
                Response: {meResult.success ? '200 OK' : 'Failed'}
              </span>
              <Badge
                status={meResult.success ? 'delivered' : 'failed'}
                label={meResult.success ? 'Validated' : 'Unauthorized'}
              />
            </div>
            <pre className="overflow-x-auto text-xs text-gray-800 leading-normal">
              {JSON.stringify(meResult.success ? meResult.data : meResult.error, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Module 2 Ingestion Mailbox Placeholder */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Webhook Ingestion Mailboxes</h3>
          <p className="text-xs text-gray-500 mt-1">
            Foundation and authentication complete. Ready for Module 2: Mailbox creation (<code className="font-mono text-gray-700">POST /h/&#123;slug&#125;</code>) and delivery worker.
          </p>
        </div>
        <Badge status="pending" label="Module 2 Next" />
      </div>
    </div>
  );
};

export default UserProfileCard;
