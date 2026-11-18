import React from 'react';
import { RefreshCw, Layers } from 'lucide-react';
import type { ServiceHealth } from '../types';
import logoImg from '../assets/logo.png';

export type TabType = 'vehicles' | 'reservations' | 'fleet' | 'desk' | 'events' | 'analytics';

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  health: ServiceHealth;
  refreshing: boolean;
  onRefreshAll: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  health,
  refreshing,
  onRefreshAll,
}) => {
  const allOnline = health.fleet && health.booking && health.payment && health.notification && health.analytics;

  return (
    <header className="bg-white border-b border-slate-300 sticky top-0 z-30">
      {/* Top Banner / System Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 border-b border-slate-200">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white flex items-center justify-center border border-slate-300 p-1 shrink-0 shadow-2xs">
              <img src={logoImg} alt="DriveHub Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-slate-950 uppercase font-mono">DriveHub</span>
                <span className="text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-300 font-mono">
                  Microservices (5 Services)
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">Event-Driven Fleet & Rental Architecture</p>
            </div>
          </div>

          {/* Microservices Status Indicators */}
          <div className="hidden lg:flex items-center gap-3 bg-slate-100 border border-slate-300 px-3 py-1.5 text-xs text-slate-700 font-mono">
            <span className="font-semibold text-slate-500 flex items-center gap-1.5 uppercase text-[11px]">
              <Layers className="w-3.5 h-3.5" /> Services:
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${health.fleet ? 'bg-emerald-600' : 'bg-rose-600 animate-pulse'}`} />
              <span className={health.fleet ? 'text-slate-900 font-medium' : 'text-rose-600 font-bold'}>Fleet:3001</span>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${health.booking ? 'bg-emerald-600' : 'bg-rose-600 animate-pulse'}`} />
              <span className={health.booking ? 'text-slate-900 font-medium' : 'text-rose-600 font-bold'}>Booking:3002</span>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${health.payment ? 'bg-emerald-600' : 'bg-rose-600 animate-pulse'}`} />
              <span className={health.payment ? 'text-slate-900 font-medium' : 'text-rose-600 font-bold'}>Payment:3003</span>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${health.notification ? 'bg-emerald-600' : 'bg-rose-600 animate-pulse'}`} />
              <span className={health.notification ? 'text-slate-900 font-medium' : 'text-rose-600 font-bold'}>Notify:3004</span>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${health.analytics ? 'bg-emerald-600' : 'bg-rose-600 animate-pulse'}`} />
              <span className={health.analytics ? 'text-slate-900 font-medium' : 'text-rose-600 font-bold'}>Analytics:3005</span>
            </div>

            <button
              onClick={onRefreshAll}
              title="Refresh services health"
              className="ml-1 p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200 border border-transparent hover:border-slate-300 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-slate-950' : ''}`} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs (Sharp, architectural tab bar) */}
        <div className="flex space-x-1 sm:space-x-2 py-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'vehicles'
                ? 'bg-slate-950 text-white border-slate-950'
                : 'bg-white text-slate-600 border-slate-200 hover:text-slate-950 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            Explore Vehicles
          </button>
          <button
            onClick={() => setActiveTab('reservations')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'reservations'
                ? 'bg-slate-950 text-white border-slate-950'
                : 'bg-white text-slate-600 border-slate-200 hover:text-slate-950 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            Reservations & Payments
          </button>
          <button
            onClick={() => setActiveTab('desk')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'desk'
                ? 'bg-slate-950 text-white border-slate-950'
                : 'bg-white text-slate-600 border-slate-200 hover:text-slate-950 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            Rental Counter Desk
          </button>
          <button
            onClick={() => setActiveTab('fleet')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'fleet'
                ? 'bg-slate-950 text-white border-slate-950'
                : 'bg-white text-slate-600 border-slate-200 hover:text-slate-950 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            Fleet Inventory
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'events'
                ? 'bg-slate-950 text-white border-slate-950'
                : 'bg-white text-slate-600 border-slate-200 hover:text-slate-950 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            Live Event Stream
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'analytics'
                ? 'bg-slate-950 text-white border-slate-950'
                : 'bg-white text-slate-600 border-slate-200 hover:text-slate-950 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            Executive Analytics
          </button>
        </div>
      </div>

      {!allOnline && (
        <div className="bg-amber-50 border-t border-b border-amber-300 px-4 py-2 text-xs text-amber-900 text-center font-mono">
          <span className="font-bold">[SYSTEM NOTICE]</span> Some microservices are cold or offline. Ensure Docker is running (<code className="bg-amber-100 px-1 py-0.5 border border-amber-300 text-amber-950 font-bold">docker compose up</code>).
        </div>
      )}
    </header>
  );
};
