import React, { useEffect } from 'react';
import { X, Printer, ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { Booking, Payment } from '../types';
import logoImg from '../assets/logo.png';

interface InvoiceModalProps {
  booking: Booking | null;
  payment: Payment | null;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ booking, payment, onClose }) => {
  if (!booking) return null;

  const invoiceNo = `DH-INV-${booking.id.toString().padStart(5, '0')}`;
  const totalPaid = payment ? payment.amount : booking.totalPrice + booking.deposit;

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-xs font-mono print:fixed print:inset-0 print:p-0 print:bg-white print:z-[9999]"
      onClick={onClose}
    >
      <div
        className="bg-white max-w-2xl w-full border border-slate-400 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden print:max-h-none print:h-auto print:border-none print:shadow-none print:overflow-visible print:w-full print:max-w-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar (Sticky & always visible) */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-300 bg-slate-100 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-slate-950 inline-block"></span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Tax Invoice & Rental Agreement
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 text-xs font-bold uppercase text-white bg-slate-950 hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="px-2.5 py-1.5 text-xs font-bold uppercase text-slate-700 hover:text-white bg-slate-200 hover:bg-rose-600 flex items-center gap-1 transition-colors cursor-pointer border border-slate-300 hover:border-rose-700"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Body */}
        <div className="p-6 sm:p-8 space-y-6 text-slate-950 bg-white overflow-y-auto flex-1 print:overflow-visible print:p-0">
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-slate-950 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 border border-slate-400 p-1 bg-white">
                <img src={logoImg} alt="DriveHub Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-lg font-bold uppercase tracking-wider text-slate-950">
                  DriveHub Vehicle Rental
                </h1>
                <p className="text-[10px] text-slate-600">Enterprise Fleet & Mobility Solutions Ltd.</p>
                <p className="text-[10px] text-slate-500">Business Reg: PV-89210-ITS4243</p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-bold uppercase bg-slate-950 text-white px-2 py-0.5 inline-block">
                TAX INVOICE & AGREEMENT
              </div>
              <p className="text-xs font-bold text-slate-950 mt-1">{invoiceNo}</p>
              <p className="text-[10px] text-slate-500">Date: {new Date().toLocaleDateString()}</p>
            </div>
          </div>

          {/* Customer & Vehicle Info */}
          <div className="grid grid-cols-2 gap-4 text-xs border border-slate-300 p-4 bg-slate-50/50">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Customer / Hirer</span>
              <p className="font-bold text-slate-950">{booking.customerName}</p>
              <p className="text-slate-600">{booking.customerEmail}</p>
              <p className="text-[10px] text-slate-500 mt-1">Status: Verified Customer</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Rental Assignment</span>
              <p className="font-bold text-slate-950">Vehicle ID: #{booking.vehicleId}</p>
              <p className="text-slate-600">Period: {booking.startDate} → {booking.endDate}</p>
              <p className="text-[10px] text-emerald-800 font-bold mt-1">Status: {booking.status}</p>
            </div>
          </div>

          {/* Pricing Table */}
          <div className="border border-slate-300">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3 text-center">Daily Rate</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                <tr>
                  <td className="py-2.5 px-3">
                    <span className="font-bold">Vehicle Hire Charges</span>
                    <span className="block text-[10px] text-slate-500">Agreed rental schedule duration</span>
                  </td>
                  <td className="py-2.5 px-3 text-center">${booking.dailyRate.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right font-bold">${booking.totalPrice.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3">
                    <span className="font-bold">Refundable Security Deposit (20%)</span>
                    <span className="block text-[10px] text-slate-500">Refunded upon safe on-time return</span>
                  </td>
                  <td className="py-2.5 px-3 text-center">--</td>
                  <td className="py-2.5 px-3 text-right font-bold text-emerald-800">${booking.deposit.toFixed(2)}</td>
                </tr>
                {booking.lateFee > 0 && (
                  <tr>
                    <td className="py-2.5 px-3 text-rose-800 font-bold">
                      Assessed Late Return Penalty (1.5x)
                    </td>
                    <td className="py-2.5 px-3 text-center text-rose-800">1.5x Rate</td>
                    <td className="py-2.5 px-3 text-right font-bold text-rose-800">${booking.lateFee.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t-2 border-slate-950 bg-slate-50 font-bold text-xs">
                <tr>
                  <td colSpan={2} className="py-3 px-3 uppercase text-slate-900">Total Settled Amount</td>
                  <td className="py-3 px-3 text-right text-base text-slate-950 font-bold">
                    ${totalPaid.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Terms & Legal Agreement */}
          <div className="border border-slate-200 p-3 bg-slate-50 text-[10px] text-slate-600 space-y-1.5 leading-relaxed">
            <span className="font-bold uppercase text-slate-900 block text-[11px]">Rental Terms & Conditions</span>
            <p>1. <strong>Vehicle Custody:</strong> The hirer agrees to return the vehicle in good running condition on or before the specified return date.</p>
            <p>2. <strong>Late Return Penalty:</strong> A late fee of 1.5 times the daily rental rate is assessed for each 24-hour overdue period.</p>
            <p>3. <strong>Deposit Settlement:</strong> The held security deposit is automatically refunded minus any incurred penalties upon verified return.</p>
          </div>

          {/* Signature & Authentication Stamp */}
          <div className="flex items-end justify-between pt-4 border-t border-slate-300 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">System Verification</span>
              <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-[11px]">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" /> Digitally Authenticated & Paid
              </div>
              <p className="text-[10px] font-mono text-slate-400">HASH: SHA256-DH{booking.id}992B10E</p>
            </div>

            <div className="text-right border-t border-slate-950 pt-2 w-48">
              <p className="font-bold text-xs uppercase">DriveHub Counter Desk</p>
              <p className="text-[10px] text-slate-500">Authorized Officer Signature</p>
            </div>
          </div>
        </div>

        {/* Bottom Control Bar (Always visible at the bottom) */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-300 bg-slate-100 shrink-0 print:hidden">
          <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
            Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 text-slate-800 text-[10px] font-bold">ESC</kbd> or click outside to close
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-bold uppercase text-slate-800 bg-white hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 text-xs font-bold uppercase text-white bg-slate-950 hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
