import React, { useState } from 'react';
import { Bell, RefreshCw, Zap, Clock, ShieldCheck, CreditCard, Key, RotateCcw, Ban } from 'lucide-react';
import type { NotificationItem } from '../types';

interface EventsTabProps {
  notifications: NotificationItem[];
  loading: boolean;
  onRefresh: () => void;
}

export const EventsTab: React.FC<EventsTabProps> = ({ notifications, loading, onRefresh }) => {
  const [filterBookingId, setFilterBookingId] = useState<string>('');

  const getEventBadge = (event: string) => {
    switch (event) {
      case 'booking.created':
        return {
          bg: 'bg-amber-50 text-amber-900 border-amber-300',
          icon: Clock,
          label: 'booking.created',
        };
      case 'payment.completed':
        return {
          bg: 'bg-emerald-50 text-emerald-900 border-emerald-300',
          icon: CreditCard,
          label: 'payment.completed',
        };
      case 'booking.confirmed':
        return {
          bg: 'bg-emerald-50 text-emerald-950 border-emerald-300',
          icon: ShieldCheck,
          label: 'booking.confirmed',
        };
      case 'booking.picked_up':
        return {
          bg: 'bg-blue-50 text-blue-900 border-blue-300',
          icon: Key,
          label: 'booking.picked_up',
        };
      case 'booking.returned':
        return {
          bg: 'bg-indigo-50 text-indigo-900 border-indigo-300',
          icon: RotateCcw,
          label: 'booking.returned',
        };
      case 'booking.cancelled':
      case 'payment.failed':
        return {
          bg: 'bg-rose-50 text-rose-900 border-rose-300',
          icon: Ban,
          label: event,
        };
      case 'payment.refunded':
        return {
          bg: 'bg-purple-50 text-purple-900 border-purple-300',
          icon: RefreshCw,
          label: 'payment.refunded',
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-800 border-slate-300',
          icon: Zap,
          label: event,
        };
    }
  };

  const filtered = notifications.filter((n) => {
    if (!filterBookingId) return true;
    return n.bookingId?.toString() === filterBookingId;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-slate-300 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase font-mono">Live Event Audit Stream</h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase font-mono bg-emerald-100 text-emerald-900 border border-emerald-300">
              <span className="w-1.5 h-1.5 bg-emerald-600 animate-ping" />
              RabbitMQ: drivehub.events
            </span>
          </div>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Asynchronous event bus messages broadcast across microservices and logged by Notification Service.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono">
          <input
            type="number"
            placeholder="Filter Booking #..."
            value={filterBookingId}
            onChange={(e) => setFilterBookingId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 bg-white focus:outline-hidden focus:border-slate-950 w-36 font-mono"
          />

          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-1.5 text-xs font-bold uppercase text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Events timeline */}
      <div className="bg-white border border-slate-300 p-5 shadow-xs font-mono">
        {loading && notifications.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading events...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Bell className="w-8 h-8 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold uppercase text-slate-950">No events captured yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Events are automatically captured when a booking is created, confirmed, picked up, returned, or cancelled.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filtered.map((item) => {
              const badge = getEventBadge(item.event);
              const Icon = badge.icon;
              
              const rawDate = item.sentAt || item.createdAt;
              let dateFormatted = 'Just now';
              if (rawDate) {
                const parsed = new Date(rawDate);
                if (!isNaN(parsed.getTime())) {
                  dateFormatted = parsed.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                }
              }

              const email = item.recipient || item.customerEmail;

              return (
                <div key={item.id} className="py-3.5 flex items-start gap-3.5 hover:bg-slate-50 px-2 transition-colors">
                  <div className={`w-8 h-8 border flex items-center justify-center shrink-0 mt-0.5 ${badge.bg}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 border ${badge.bg}`}>
                        {badge.label}
                      </span>
                      {item.bookingId && (
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-800 font-bold px-1.5 py-0.5 border border-slate-300">
                          BOOKING #{item.bookingId}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500 ml-auto font-mono">{dateFormatted}</span>
                    </div>

                    <p className="text-xs text-slate-900 font-medium leading-relaxed font-sans">{item.message}</p>
                    {email && (
                      <span className="text-[11px] text-slate-500 mt-0.5 block font-mono">
                        Recipient: {email}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
