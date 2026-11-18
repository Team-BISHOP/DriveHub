import React, { useState } from 'react';
import { Calendar, CreditCard, User, FileText } from 'lucide-react';
import type { Booking, Payment } from '../types';
import { bookingApi, paymentApi } from '../api/client';
import { PaymentModal } from './PaymentModal';
import { InvoiceModal } from './InvoiceModal';

interface ReservationsTabProps {
  bookings: Booking[];
  payments: Payment[];
  loading: boolean;
  onRefresh: () => void;
}

export const ReservationsTab: React.FC<ReservationsTabProps> = ({
  bookings,
  payments,
  loading,
  onRefresh,
}) => {
  const [filterEmail, setFilterEmail] = useState('');
  const [activePayment, setActivePayment] = useState<Payment | null>(null);
  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getPaymentForBooking = (bookingId: number) => {
    return payments.find((p) => p.bookingId === bookingId);
  };

  const handlePayClick = async (bookingId: number) => {
    setErrorMsg(null);
    let pay = getPaymentForBooking(bookingId);
    if (!pay) {
      try {
        const fetched = await paymentApi.getPayments(bookingId);
        pay = fetched[0];
      } catch {
        setErrorMsg('Unable to retrieve payment record for this booking.');
        return;
      }
    }

    if (pay) {
      setActivePayment(pay);
    } else {
      setErrorMsg('Payment record not found yet. The RabbitMQ worker may still be processing the event.');
    }
  };

  const handleCancelClick = async (bookingId: number) => {
    if (!window.confirm(`Are you sure you want to cancel Booking #${bookingId}? Paid amounts and deposit will be refunded in full.`)) {
      return;
    }

    try {
      setActionLoading(bookingId);
      setErrorMsg(null);
      await bookingApi.cancelBooking(bookingId);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to cancel booking.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredBookings = bookings.filter((b) =>
    filterEmail ? b.customerEmail.toLowerCase().includes(filterEmail.toLowerCase()) : true
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-slate-300 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase font-mono">Reservations & Payments</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Customer reservations log, deposit payments, legal rental agreements, and cancellation refunds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Filter by customer email..."
            value={filterEmail}
            onChange={(e) => setFilterEmail(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 bg-white focus:outline-hidden focus:border-slate-950 w-56 font-mono"
          />
          <button
            onClick={onRefresh}
            className="px-4 py-1.5 text-xs font-bold uppercase font-mono text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-300 text-xs text-rose-900 font-mono flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold ml-2 cursor-pointer">✕</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white border border-slate-300 animate-pulse" />
          ))}
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-300 p-8 space-y-2 font-mono">
          <h3 className="text-sm font-bold uppercase text-slate-950">No reservations found</h3>
          <p className="text-xs text-slate-500">
            {bookings.length === 0 ? 'Make a reservation in the "Explore Vehicles" tab to start.' : 'No reservations match your filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((b) => {
            const pay = getPaymentForBooking(b.id);
            const isPending = b.status === 'PENDING';
            const isConfirmed = b.status === 'CONFIRMED';
            const isPickedUp = b.status === 'PICKED_UP';
            const isReturned = b.status === 'RETURNED';
            const isCancelled = b.status === 'CANCELLED';

            return (
              <div
                key={b.id}
                className="bg-white border border-slate-300 hover:border-slate-500 p-5 shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-5 font-mono"
              >
                {/* Left: Info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-950 bg-slate-100 px-2 py-0.5 border border-slate-300">
                      BOOKING #{b.id}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 border ${
                        isPending
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : isConfirmed
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : isPickedUp
                          ? 'bg-blue-50 text-blue-800 border-blue-300'
                          : isReturned
                          ? 'bg-slate-100 text-slate-800 border-slate-300'
                          : 'bg-rose-50 text-rose-800 border-rose-300'
                      }`}
                    >
                      {b.status}
                    </span>

                    {pay && (
                      <span className="text-[11px] text-slate-500">
                        Payment: <span className="text-slate-950 font-bold">{pay.status}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-700">
                    <div className="flex items-center gap-1 font-bold text-slate-950">
                      <User className="w-3.5 h-3.5 text-slate-500" />
                      {b.customerName} ({b.customerEmail})
                    </div>
                    <div className="flex items-center gap-1 text-slate-600">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      {b.startDate} → {b.endDate}
                    </div>
                  </div>

                  {/* Financials pill */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 pt-1">
                    <span>
                      Rental: <strong className="text-slate-950">${b.totalPrice.toFixed(2)}</strong>
                    </span>
                    <span>|</span>
                    <span>
                      Deposit: <strong className="text-emerald-800">${b.deposit.toFixed(2)}</strong>
                    </span>
                    {b.lateFee > 0 && (
                      <>
                        <span>|</span>
                        <span className="text-rose-700 font-bold">
                          Late Fee: ${b.lateFee.toFixed(2)}
                        </span>
                      </>
                    )}
                    {pay && pay.refundAmount > 0 && (
                      <>
                        <span>|</span>
                        <span className="text-emerald-800 font-bold">
                          Refunded: ${pay.refundAmount.toFixed(2)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex flex-wrap items-center gap-2.5 pt-3 md:pt-0 border-t md:border-t-0 border-slate-200">
                  {/* Download official invoice/agreement */}
                  {!isPending && !isCancelled && (
                    <button
                      onClick={() => setInvoiceBooking(b)}
                      className="px-3 py-1.5 text-xs font-bold uppercase font-mono text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-700" />
                      Agreement & Invoice
                    </button>
                  )}

                  {isPending && (
                    <button
                      onClick={() => handlePayClick(b.id)}
                      className="px-4 py-2 text-xs font-bold uppercase font-mono text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Pay ${(b.totalPrice + b.deposit).toFixed(2)}
                    </button>
                  )}

                  {(isPending || isConfirmed) && (
                    <button
                      onClick={() => handleCancelClick(b.id)}
                      disabled={actionLoading === b.id}
                      className="px-3.5 py-2 text-xs font-bold uppercase font-mono text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-300 transition-colors cursor-pointer"
                    >
                      {actionLoading === b.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}

                  {isConfirmed && (
                    <div className="text-right">
                      <span className="text-xs text-emerald-800 font-bold uppercase block">
                        [CONFIRMED] Ready for Pickup
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">Process at Rental Counter</span>
                    </div>
                  )}

                  {isPickedUp && (
                    <div className="text-right">
                      <span className="text-xs text-blue-800 font-bold uppercase block">
                        [ACTIVE] Vehicle on Road
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">Awaiting Return at Counter</span>
                    </div>
                  )}

                  {isReturned && (
                    <span className="text-xs text-slate-600 font-bold uppercase">
                      [CLOSED] Returned & Settled
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment Checkout Modal */}
      {activePayment && (
        <PaymentModal
          payment={activePayment}
          onClose={() => setActivePayment(null)}
          onSuccess={() => {
            setActivePayment(null);
            onRefresh();
          }}
        />
      )}

      {/* Printable Invoice & Agreement Modal */}
      {invoiceBooking && (
        <InvoiceModal
          booking={invoiceBooking}
          payment={getPaymentForBooking(invoiceBooking.id) || null}
          onClose={() => setInvoiceBooking(null)}
        />
      )}
    </div>
  );
};
