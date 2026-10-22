import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEventWebSocket } from '../../context/WebSocketContext';
import { Radio, ExternalLink, LogOut, Activity } from 'lucide-react';
import Badge from '../common/Badge';

export const Navbar = ({ health, activeTab = 'overview', onSelectTab }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const { isConnected } = useEventWebSocket();

  const navItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'endpoints', label: 'Endpoints' },
    { id: 'events', label: 'Events' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'account', label: 'Account & Security' },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Left: Brand & Main Navigation */}
        <div className="flex items-center gap-8">
          <button
            onClick={() => onSelectTab?.('overview')}
            className="flex items-center gap-2 focus:outline-none"
          >
            <div className="w-6 h-6 rounded-md bg-gray-900 text-white flex items-center justify-center">
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <span className="font-semibold text-gray-900 text-sm tracking-tight">HookRelay</span>
          </button>

          {/* Primary Navigation */}
          {isAuthenticated && (
            <nav className="hidden sm:flex items-center gap-1" aria-label="Main navigation">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab?.(item.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'text-gray-900 bg-gray-100 font-semibold shadow-2xs'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* Right: Live Feed Pill, Docs link & User Profile */}
        <div className="flex items-center gap-3">
          {isAuthenticated && (
            isConnected ? (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs"
                title="WebSocket /ws/events connected: streaming live events and deliveries"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="hidden sm:inline font-mono">Live Feed</span>
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
                title="Connecting to WebSocket feed..."
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="hidden sm:inline font-mono">Connecting...</span>
              </div>
            )
          )}

          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
            className="hidden md:flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
          >
            <span>API Docs</span>
            <ExternalLink className="w-3 h-3 text-gray-400" />
          </a>

          {isAuthenticated && (
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <span className="text-xs font-medium text-gray-700 font-mono hidden lg:inline max-w-[180px] truncate">
                {user?.email}
              </span>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
                aria-label="Sign out of account"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
