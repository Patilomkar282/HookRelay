import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEventWebSocket } from '../../context/WebSocketContext';
import Logo from '../common/Logo';
import {
  Radio,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  Inbox,
  Activity,
  BarChart2,
  User,
} from 'lucide-react';

export const Navbar = ({ health, activeTab = 'overview', onSelectTab }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const { isConnected } = useEventWebSocket();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'endpoints', label: 'Endpoints', icon: Inbox },
    { id: 'events', label: 'Events', icon: Activity },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'account', label: 'Account', icon: User },
  ];

  const handleSelectMobileTab = (tabId) => {
    onSelectTab?.(tabId);
    setMobileMenuOpen(false);
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 w-full max-w-full shadow-2xs">
      <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-12 h-20 sm:h-24 md:h-26 flex items-center justify-between">
        {/* Left: Brand & Desktop Navigation */}
        <div className="flex items-center gap-5 sm:gap-9 min-w-0">
          <button
            onClick={() => onSelectTab?.('overview')}
            className="flex items-center focus:outline-none shrink-0 cursor-pointer transition-transform duration-150 hover:scale-[1.02]"
            title="HookRelay — Go to Overview"
          >
            <Logo className="h-14 sm:h-16 md:h-20 lg:h-22 w-auto object-contain drop-shadow-xs" />
          </button>

          {/* Desktop Navigation */}
          {isAuthenticated && (
            <nav className="hidden sm:flex items-center gap-1.5 ml-1" aria-label="Main navigation">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab?.(item.id)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'text-gray-900 bg-gray-100 font-bold shadow-2xs'
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

        {/* Right: Status Pill, Docs link & User Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isAuthenticated && (
            isConnected ? (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs"
                title="WebSocket connected: streaming live events"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="hidden md:inline font-mono">Live Feed</span>
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
                title="Connecting to WebSocket feed..."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="hidden md:inline font-mono">Connecting...</span>
              </div>
            )
          )}



          {isAuthenticated && (
            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l border-gray-200">
              <span className="text-xs font-medium text-gray-700 font-mono hidden xl:inline max-w-[150px] truncate">
                {user?.email}
              </span>
              <button
                onClick={logout}
                className="hidden sm:inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors p-1.5 rounded hover:bg-gray-100 cursor-pointer"
                aria-label="Sign out of account"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Sign out</span>
              </button>
            </div>
          )}

          {/* Mobile Menu Hamburger Button */}
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden p-1.5 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none cursor-pointer"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Horizontal Quick-Tab Bar (Always visible on mobile for 1-touch navigation) */}
      {isAuthenticated && (
        <div className="sm:hidden flex items-center overflow-x-auto border-t border-gray-100 px-2 py-1.5 bg-gray-50/70 gap-1 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab?.(item.id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-white text-gray-900 font-semibold shadow-2xs border border-gray-200'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile Full Dropdown Menu */}
      {isAuthenticated && mobileMenuOpen && (
        <div className="sm:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-3 animate-fade-in-up shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100 text-xs text-gray-600">
            <span className="font-mono truncate max-w-[200px]">{user?.email}</span>
            <button
              onClick={() => {
                logout();
                setMobileMenuOpen(false);
              }}
              className="inline-flex items-center gap-1 text-red-600 font-medium hover:underline"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>

          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectMobileTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>


        </div>
      )}
    </header>
  );
};

export default Navbar;
