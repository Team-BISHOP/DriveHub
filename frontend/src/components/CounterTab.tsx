import React, { useState } from 'react';
import { Key, RotateCcw, CheckCircle2 } from 'lucide-react';
import type { Booking, Vehicle } from '../types';
import { bookingApi } from '../api/client';

interface CounterTabProps {
  bookings: Booking[];
  vehicles: Vehicle[];
  onRefresh: () => void;
}

export const CounterTab: React.FC<CounterTabProps> = ({ bookings, vehicles, onRefresh }) => {
  const [returnModalBooking, setReturnModalBooking] = useState<Booking | null>(null);
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const confirmedForPickup = bookings.filter((b) => b.status === 'CONFIRMED');
  const pickedUpOnRoad = bookings.filter((b) => b.status === 'PICKED_UP');

  const getVehicleInfo = (vehicleId: number) => {
    return vehicles.find((v) => v.id === vehicleId);
  };

  const handlePickup = async (bookingId: number) => {
    try {
      setProcessingId(bookingId);
      setErrorMsg(null);
      await bookingApi.pickupBooking(bookingId);
      setSuccessMsg(`Vehicle for Booking #${bookingId} marked as PICKED UP.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Pickup processing failed.');
    } finally {
      setProcessingId(null);
    }
  };

  const openReturnModal = (booking: Booking) => {
    setReturnModalBooking(booking);
    setReturnDate(booking.endDate);
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalBooking) return;

    try {
      setProcessingId(returnModalBooking.id);
      setErrorMsg(null);
      const res = await bookingApi.returnBooking(returnModalBooking.id, returnDate);
      setSuccessMsg(
        `Booking #${res.id} marked as RETURNED. Late fee: $${res.lateFee.toFixed(2)}. Deposit settled.`
      );
      setReturnModalBooking(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Return settlement failed.');
    } finally {
      setProcessingId(null);
    }
  };

  let lateDays = 0;
  let estimatedLateFee = 0;
  let estimatedDepositRefund = 0;
  if (returnModalBooking) {
    const endMs = Date.parse(returnModalBooking.endDate + 'T00:00:00Z');
    const actualMs = Date.parse(returnDate + 'T00:00:00Z');
    const diff = Math.round((actualMs - endMs) / 86400000);
    lateDays = Math.max(0, diff);
    estimatedLateFee = Math.round(lateDays * returnModalBooking.dailyRate * 1.5 * 100) / 100;
    estimatedDepositRefund = Math.max(0, Math.round((returnModalBooking.deposit - estimatedLateFee) * 100) / 100);
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 border border-slate-300 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase font-mono">Rental Counter Operations</h1>
        <p className="text-xs text-slate-500 font-mono mt-0.5">
          Counter staff desk for key handovers (Pickup) and vehicle returns with automated late penalty calculation (1.5x daily rate).
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-300 text-xs text-rose-900 font-mono flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold ml-2 cursor-pointer">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-mono flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" /> {successMsg}
          </span>
          <button onClick={() => setSuccessMsg(null)} className="font-bold ml-2 cursor-pointer">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-mono">
        {/* Section 1: Awaiting Pickup */}
        <div className="bg-white border border-slate-300 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-emerald-50 border border-emerald-300 text-emerald-800 flex items-center justify-center">
                <Key className="w-4 h-4" />
              </div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-950">Awaiting Key Handover</h2>
            </div>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300">
              {confirmedForPickup.length} pending
            </span>
          </div>

          {confirmedForPickup.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No vehicles currently awaiting key pickup. Bookings must be CONFIRMED (paid) first.
            </div>
          ) : (
            <div className="space-y-3">
              {confirmedForPickup.map((b) => {
                const v = getVehicleInfo(b.vehicleId);
                return (
                  <div
                    key={b.id}
                    className="p-4 border border-slate-300 bg-slate-50 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-950">#{b.id}</span>
                        <span className="text-xs font-bold text-slate-900 uppercase">
                          {v ? `${v.make} ${v.model} (${v.plate})` : `Vehicle #${b.vehicleId}`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Customer: <strong className="text-slate-950">{b.customerName}</strong> • {b.startDate} → {b.endDate}
                      </p>
                    </div>

                    <button
                      onClick={() => handlePickup(b.id)}
                      disabled={processingId === b.id}
                      className="px-3.5 py-1.5 text-xs font-bold uppercase text-white bg-slate-950 border border-slate-950 hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <Key className="w-3.5 h-3.5" />
                      {processingId === b.id ? 'Processing...' : 'Handover Key'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2: On Road / Awaiting Return */}
        <div className="bg-white border border-slate-300 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-50 border border-blue-300 text-blue-800 flex items-center justify-center">
                <RotateCcw className="w-4 h-4" />
              </div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-950">Active on Road (Checked Out)</h2>
            </div>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-300">
              {pickedUpOnRoad.length} on road
            </span>
          </div>

          {pickedUpOnRoad.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No vehicles currently checked out.
            </div>
          ) : (
            <div className="space-y-3">
              {pickedUpOnRoad.map((b) => {
                const v = getVehicleInfo(b.vehicleId);
                return (
                  <div
                    key={b.id}
                    className="p-4 border border-slate-300 bg-slate-50 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-950">#{b.id}</span>
                        <span className="text-xs font-bold text-slate-900 uppercase">
                          {v ? `${v.make} ${v.model} (${v.plate})` : `Vehicle #${b.vehicleId}`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Customer: <strong className="text-slate-950">{b.customerName}</strong> • Due: <strong className="text-slate-950">{b.endDate}</strong>
                      </p>
                    </div>

                    <button
                      onClick={() => openReturnModal(b)}
                      className="px-3.5 py-1.5 text-xs font-bold uppercase text-slate-950 bg-slate-200 border border-slate-400 hover:bg-slate-300 transition-colors cursor-pointer shrink-0"
                    >
                      Process Return
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Return & Settlement Modal */}
      {returnModalBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs font-mono">
          <div className="bg-white max-w-md w-full border border-slate-400 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-300 bg-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-950">Process Vehicle Return</h3>
                <p className="text-xs text-slate-600">Booking #{returnModalBooking.id} • {returnModalBooking.customerName}</p>
              </div>
              <button
                onClick={() => setReturnModalBooking(null)}
                className="text-slate-500 hover:text-slate-950 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReturnSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Actual Return Date</label>
                <input
                  type="date"
                  required
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Scheduled return was: <strong>{returnModalBooking.endDate}</strong>
                </p>
              </div>

              {/* Penalty and deposit calculation breakdown */}
              <div className="p-4 bg-slate-50 border border-slate-300 space-y-2 text-xs">
                <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-1">
                  Deposit & Penalty Settlement
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>Held Security Deposit</span>
                  <span className="font-bold text-slate-950">${returnModalBooking.deposit.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>Late Days</span>
                  <span className={`font-bold ${lateDays > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                    {lateDays} day(s)
                  </span>
                </div>

                {lateDays > 0 ? (
                  <div className="flex justify-between text-rose-700 font-bold">
                    <span>Late Penalty (1.5x daily rate)</span>
                    <span>- ${estimatedLateFee.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="text-emerald-800 font-bold text-[11px]">
                    [ON-TIME]: Returned on schedule. Zero penalty.
                  </div>
                )}

                <div className="pt-2 border-t border-slate-300 flex justify-between font-bold text-sm text-slate-950">
                  <span>Net Refund to Customer</span>
                  <span className="text-emerald-800">${estimatedDepositRefund.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnModalBooking(null)}
                  className="px-4 py-2 text-xs font-bold uppercase text-slate-700 hover:text-slate-950 border border-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingId === returnModalBooking.id}
                  className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-white bg-slate-950 border border-slate-950 hover:bg-slate-800 cursor-pointer flex items-center gap-1.5"
                >
                  Confirm Return & Settle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
