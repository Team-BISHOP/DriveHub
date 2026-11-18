import React, { useState } from 'react';
import { X, CreditCard, Banknote, ShieldAlert, CheckCircle2, Lock, ArrowRight } from 'lucide-react';
import type { Payment } from '../types';
import { paymentApi } from '../api/client';

interface PaymentModalProps {
  payment: Payment | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ payment, onClose, onSuccess }) => {
  if (!payment) return null;

  const [method, setMethod] = useState<'CARD' | 'CASH'>('CARD');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvc, setCvc] = useState('888');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const cleanCard = cardNumber.replace(/\s+/g, '');
      await paymentApi.processPayment(payment.id, {
        method,
        cardNumber: method === 'CARD' ? cleanCard : undefined,
      });
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Payment processing failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white max-w-md w-full border border-slate-400 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-300 bg-slate-100 font-mono">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-950">Process Payment</h3>
            <p className="text-xs text-slate-600">Booking #{payment.bookingId} • {payment.customerEmail}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-950 hover:bg-slate-200 border border-transparent hover:border-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center space-y-3 font-mono">
            <div className="w-12 h-12 bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold uppercase text-slate-950">Payment Processed Successfully</h4>
            <p className="text-xs text-slate-600">
              Reservation CONFIRMED. Event <code className="bg-slate-100 px-1 border border-slate-300 text-slate-800 font-bold">payment.completed</code> published.
            </p>
          </div>
        ) : (
          <form onSubmit={handlePay} className="p-6 space-y-4">
            {/* Amount Summary */}
            <div className="p-4 bg-slate-950 text-white border border-slate-800 flex items-center justify-between font-mono">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Due</span>
                <span className="text-xs text-slate-300">Incl. ${payment.deposit.toFixed(2)} deposit</span>
              </div>
              <div className="text-xl font-bold font-mono">${payment.amount.toFixed(2)}</div>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-300 flex items-start gap-2.5 text-xs text-rose-900 font-mono">
                <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Payment Method Switcher */}
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-slate-700 mb-1.5">Payment Method</label>
              <div className="grid grid-cols-2 gap-2 font-mono">
                <button
                  type="button"
                  onClick={() => setMethod('CARD')}
                  className={`py-2 px-3 text-xs font-bold uppercase border flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    method === 'CARD'
                      ? 'bg-slate-950 text-white border-slate-950'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <CreditCard className="w-4 h-4" /> Credit Card
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('CASH')}
                  className={`py-2 px-3 text-xs font-bold uppercase border flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    method === 'CASH'
                      ? 'bg-slate-950 text-white border-slate-950'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <Banknote className="w-4 h-4" /> Cash Desk
                </button>
              </div>
            </div>

            {method === 'CARD' ? (
              <div className="space-y-3 font-mono">
                {/* Demo rule notification */}
                <div className="p-3 bg-amber-50 border border-amber-300 text-[11px] text-amber-950 leading-relaxed">
                  <span className="font-bold uppercase">[DEMO RULE]:</span> Cards ending in <code className="font-mono bg-amber-200/80 px-1 py-0.5 border border-amber-400 font-bold">0000</code> decline (402). Any other card succeeds.
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-slate-700 mb-1">Card Number</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="4242 4242 4242 4242"
                      className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
                    />
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono font-bold uppercase text-slate-700 mb-1">Expires (MM/YY)</label>
                    <input
                      type="text"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono font-bold uppercase text-slate-700 mb-1">Security Code (CVC)</label>
                    <input
                      type="password"
                      value={cvc}
                      maxLength={4}
                      onChange={(e) => setCvc(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono text-center"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-300 text-xs text-slate-700 font-mono">
                Counter staff will record <strong className="text-slate-950">${payment.amount.toFixed(2)}</strong> cash collection at vehicle handover.
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold uppercase font-mono text-slate-700 hover:text-slate-950 border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold uppercase font-mono tracking-wider text-white bg-slate-950 border border-slate-950 hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
              >
                {submitting ? 'Processing...' : `Pay $${payment.amount.toFixed(2)}`}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
