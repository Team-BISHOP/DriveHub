import React, { useState } from 'react';
import { X, Calendar, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react';
import type { Vehicle } from '../types';
import { bookingApi } from '../api/client';

interface BookingModalProps {
  vehicle: Vehicle | null;
  onClose: () => void;
  onSuccess: (bookingId: number) => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({ vehicle, onClose, onSuccess }) => {
  if (!vehicle) return null;

  const getFormattedDate = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0];
  };

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [startDate, setStartDate] = useState(getFormattedDate(1));
  const [endDate, setEndDate] = useState(getFormattedDate(4));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startMs = Date.parse(startDate + 'T00:00:00Z');
  const endMs = Date.parse(endDate + 'T00:00:00Z');
  const daysDiff = Math.max(1, Math.round((endMs - startMs) / 86400000));
  const isInvalidDate = isNaN(daysDiff) || daysDiff <= 0;

  const rentalTotal = isInvalidDate ? 0 : Math.round(daysDiff * vehicle.dailyRate * 100) / 100;
  const deposit = isInvalidDate ? 0 : Math.round(rentalTotal * 0.2 * 100) / 100;
  const grandTotal = Math.round((rentalTotal + deposit) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidDate) {
      setError('End date must be after start date.');
      return;
    }
    if (!customerName.trim() || !customerEmail.trim()) {
      setError('Please provide customer name and valid email.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await bookingApi.createBooking({
        vehicleId: vehicle.id,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        startDate,
        endDate,
      });
      onSuccess(res.id);
    } catch (err: any) {
      setError(err.message || 'Failed to complete reservation. Date conflict or server error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white max-w-lg w-full border border-slate-400 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-300 bg-slate-100">
          <div>
            <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-slate-950">Reserve Vehicle</h3>
            <p className="text-xs text-slate-600 font-mono">
              {vehicle.make} {vehicle.model} ({vehicle.year}) • {vehicle.plate}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-950 hover:bg-slate-200 border border-transparent hover:border-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-300 flex items-start gap-2.5 text-xs text-rose-900 font-mono">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-slate-700 mb-1">Customer Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Nimal Perera"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-slate-700 mb-1">Customer Email</label>
              <input
                type="email"
                required
                placeholder="nimal@example.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
              />
            </div>
          </div>

          {/* Rental Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Start Date
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Return Date
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
              />
            </div>
          </div>

          {/* Pricing Summary Box */}
          <div className="bg-slate-50 border border-slate-300 p-4 space-y-2.5 font-mono">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200 pb-1">
              Rental Price Breakdown
            </div>
            
            <div className="flex justify-between text-xs text-slate-600">
              <span>Rental Duration</span>
              <span className="font-bold text-slate-950">{isInvalidDate ? '--' : `${daysDiff} day(s)`}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-600">
              <span>Daily Rate</span>
              <span className="font-bold text-slate-950">${vehicle.dailyRate.toFixed(2)} / day</span>
            </div>
            <div className="flex justify-between text-xs text-slate-600">
              <span>Rental Total</span>
              <span className="font-bold text-slate-950">${rentalTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-emerald-800">
              <span className="flex items-center gap-1 font-bold">
                <ShieldCheck className="w-3.5 h-3.5" /> Security Deposit (20%)
              </span>
              <span className="font-bold">+ ${deposit.toFixed(2)}</span>
            </div>

            <div className="pt-2 border-t border-slate-300 flex justify-between items-baseline">
              <span className="text-xs font-bold uppercase text-slate-950">Total Due Today</span>
              <span className="text-base font-bold text-slate-950 font-mono">${grandTotal.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-slate-500">
              * Deposit is fully refundable upon on-time return without damage.
            </p>
          </div>

          {/* Submit buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold uppercase font-mono text-slate-700 hover:text-slate-950 border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || isInvalidDate}
              className="px-5 py-2 text-xs font-bold uppercase font-mono tracking-wider text-white bg-slate-950 border border-slate-950 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
            >
              {submitting ? 'Creating...' : 'Proceed to Reserve'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
