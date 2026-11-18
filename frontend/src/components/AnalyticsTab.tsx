import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AnalyticsSummary, EventThroughput, FinancialTransaction } from '../types';
import { analyticsApi } from '../api/client';

interface AnalyticsTabProps {
  onRefreshAll?: () => void;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ onRefreshAll }) => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [events, setEvents] = useState<EventThroughput[]>([]);
  const [financials, setFinancials] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const [s, ev, fin] = await Promise.all([
        analyticsApi.getSummary().catch((err) => { console.error('getSummary error:', err); return null; }),
        analyticsApi.getEvents().catch((err) => { console.error('getEvents error:', err); return []; }),
        analyticsApi.getFinancialStream().catch((err) => { console.error('getFinancialStream error:', err); return []; }),
      ]);
      setSummary(s);
      setEvents(ev);
      setFinancials(fin);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner (Identical layout to Fleet and Reservations tabs) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-slate-300 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase font-mono">
            Executive Analytics & Fleet Metrics
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Real-time business intelligence aggregated across microservices into PostgreSQL (analyticsdb).
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono">
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="px-4 py-1.5 text-xs font-bold uppercase text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* 4 Sharp KPI Metric Cards (No cartoonish icons, crisp enterprise style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Revenue */}
        <div className="bg-white border border-slate-300 p-5 shadow-xs">
          <div className="text-[10px] font-bold uppercase font-mono tracking-wider text-slate-500">
            Net Rental Revenue
          </div>
          <div className="text-2xl font-bold font-mono text-slate-950 mt-1">
            ${summary ? summary.netRevenue.toFixed(2) : '0.00'}
          </div>
          <div className="text-xs font-mono text-slate-500 border-t border-slate-200 pt-2 mt-3 flex justify-between">
            <span>Gross: ${summary ? summary.grossRevenue.toFixed(2) : '0.00'}</span>
            <span className="text-rose-700">Refunds: -${summary ? summary.totalRefunds.toFixed(2) : '0.00'}</span>
          </div>
        </div>

        {/* Fleet Utilization */}
        <div className="bg-white border border-slate-300 p-5 shadow-xs">
          <div className="text-[10px] font-bold uppercase font-mono tracking-wider text-slate-500">
            Fleet Utilization Rate
          </div>
          <div className="text-2xl font-bold font-mono text-slate-950 mt-1">
            {summary ? summary.fleetUtilization.toFixed(1) : '0.0'}%
          </div>
          <div className="text-xs font-mono text-slate-500 border-t border-slate-200 pt-2 mt-3 flex justify-between">
            <span>Active on Road: <strong className="text-slate-900">{summary?.activeRentals ?? 0}</strong></span>
            <span>Total Fleet: <strong className="text-slate-900">{summary?.fleetTotal ?? 0}</strong></span>
          </div>
        </div>

        {/* Bookings Summary */}
        <div className="bg-white border border-slate-300 p-5 shadow-xs">
          <div className="text-[10px] font-bold uppercase font-mono tracking-wider text-slate-500">
            Total Bookings
          </div>
          <div className="text-2xl font-bold font-mono text-slate-950 mt-1">
            {summary ? summary.totalBookings : 0}
          </div>
          <div className="text-xs font-mono text-slate-500 border-t border-slate-200 pt-2 mt-3 flex justify-between">
            <span>Confirmed: <strong className="text-emerald-800">{summary?.confirmedBookings ?? 0}</strong></span>
            <span>Cancelled: <strong className="text-rose-700">{summary?.cancelledBookings ?? 0}</strong></span>
          </div>
        </div>

        {/* Late Penalties */}
        <div className="bg-white border border-slate-300 p-5 shadow-xs">
          <div className="text-[10px] font-bold uppercase font-mono tracking-wider text-slate-500">
            Late Penalties Collected
          </div>
          <div className="text-2xl font-bold font-mono text-slate-950 mt-1">
            ${summary ? summary.lateFeesCollected.toFixed(2) : '0.00'}
          </div>
          <div className="text-xs font-mono text-slate-500 border-t border-slate-200 pt-2 mt-3 flex justify-between">
            <span>Penalty Rate: 1.5x Daily</span>
            <span>Failed Pays: {summary?.failedPayments ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Main Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: RabbitMQ Event Bus Throughput */}
        <div className="bg-white border border-slate-300 shadow-xs font-mono">
          <div className="px-5 py-3.5 border-b border-slate-300 bg-slate-50 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-950">
              RabbitMQ Event Bus Throughput
            </h2>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-slate-100 border border-slate-300 text-slate-700">
              drivehub.events
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Event Routing Key</th>
                  <th className="py-2.5 px-4 text-center">Fired Count</th>
                  <th className="py-2.5 px-4 text-right">Last Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-400">
                      No events registered yet. Make bookings or payments to see throughput counters.
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => (
                    <tr key={ev.event} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-bold text-slate-950">{ev.event}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="bg-slate-100 px-2 py-0.5 border border-slate-300 font-bold text-slate-900">
                          {ev.count}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-500">
                        {new Date(ev.lastOccurred).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Financial Audit Transactions */}
        <div className="bg-white border border-slate-300 shadow-xs font-mono">
          <div className="px-5 py-3.5 border-b border-slate-300 bg-slate-50 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-950">
              Financial Audit Ledger
            </h2>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-slate-100 border border-slate-300 text-slate-700">
              {financials.length} entries
            </span>
          </div>

          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Transaction Type</th>
                  <th className="py-2.5 px-4">Booking #</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                  <th className="py-2.5 px-4 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {financials.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      No financial transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  financials.map((t) => {
                    const isPayment = t.event === 'payment.completed';
                    const isRefund = t.event === 'payment.refunded';
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-1.5 py-0.5 border text-[10px] font-bold uppercase ${
                              isPayment
                                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                : isRefund
                                ? 'bg-rose-50 text-rose-900 border-rose-300'
                                : 'bg-amber-50 text-amber-900 border-amber-300'
                            }`}
                          >
                            {isPayment ? '+ PAYMENT' : isRefund ? '- REFUND' : 'LATE FEE'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-800 font-bold">#{t.bookingId}</td>
                        <td
                          className={`py-2.5 px-4 text-right font-bold ${
                            isPayment ? 'text-emerald-800' : isRefund ? 'text-rose-700' : 'text-slate-900'
                          }`}
                        >
                          ${Number(t.amount).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-500">
                          {new Date(t.createdAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
