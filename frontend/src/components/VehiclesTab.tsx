import React, { useState } from 'react';
import { Search, Car, PlusCircle, ArrowUpRight } from 'lucide-react';
import type { Vehicle } from '../types';
import { resolveFleetImageUrl } from '../api/client';
import { BookingModal } from './BookingModal';

interface VehiclesTabProps {
  vehicles: Vehicle[];
  loading: boolean;
  onOpenBookingSuccess: (bookingId: number) => void;
  onNavigateToFleet: () => void;
}

export const VehiclesTab: React.FC<VehiclesTabProps> = ({
  vehicles,
  loading,
  onOpenBookingSuccess,
  onNavigateToFleet,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [bookingVehicle, setBookingVehicle] = useState<Vehicle | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});

  // Categories extraction
  const categories = ['ALL', ...Array.from(new Set(vehicles.map((v) => v.category.toUpperCase())))];

  // Filtering
  const filteredVehicles = vehicles.filter((v) => {
    const matchesSearch =
      v.make.toLowerCase().includes(search.toLowerCase()) ||
      v.model.toLowerCase().includes(search.toLowerCase()) ||
      v.plate.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || v.category.toUpperCase() === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Filters (Sharp industrial layout) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-slate-300 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase font-mono">Available Vehicles</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Select a vehicle to book for rental with real-time Fleet verification.
          </p>
        </div>

        {/* Search & Category Filter */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search make or model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 bg-white focus:outline-hidden focus:border-slate-950 w-48 font-mono"
            />
          </div>

          <div className="flex items-center gap-1 border border-slate-300 p-1 bg-slate-50">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 text-xs font-mono font-bold uppercase transition-colors cursor-pointer border ${
                  selectedCategory === cat
                    ? 'bg-slate-950 text-white border-slate-950'
                    : 'bg-white text-slate-600 border-transparent hover:border-slate-300 hover:text-slate-950'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-white border border-slate-300 p-5 animate-pulse" />
          ))}
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-300 p-8 space-y-3">
          <div className="w-12 h-12 bg-slate-100 border border-slate-300 flex items-center justify-center mx-auto text-slate-500">
            <Car className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-950 uppercase font-mono">No vehicles found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto font-mono">
            {vehicles.length === 0
              ? 'The fleet database is currently empty. Initialize with sample vehicles or add via Fleet tab.'
              : 'No vehicles match your search and filter criteria.'}
          </p>
          {vehicles.length === 0 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={async () => {
                  const sampleCars = [
                    { make: 'Toyota', model: 'Aqua', year: 2022, category: 'CAR', plate: 'WP-CAB-1234', dailyRate: 40 },
                    { make: 'Honda', model: 'Vezel', year: 2023, category: 'SUV', plate: 'WP-CAG-5678', dailyRate: 65 },
                    { make: 'Toyota', model: 'HiAce', year: 2021, category: 'VAN', plate: 'WP-NA-9012', dailyRate: 85 },
                    { make: 'Toyota', model: 'Prius', year: 2023, category: 'CAR', plate: 'WP-CBA-3456', dailyRate: 50 },
                  ];
                  for (const c of sampleCars) {
                    await fetch('/api/fleet/vehicles', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(c),
                    }).catch(() => {});
                  }
                  window.location.reload();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-emerald-800 text-white border border-emerald-900 hover:bg-emerald-900 transition-colors cursor-pointer"
              >
                + Quick Seed Sample Fleet
              </button>
              <button
                onClick={onNavigateToFleet}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-slate-950 text-white border border-slate-950 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" /> Go to Fleet Management
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredVehicles.map((v) => {
            const isAvailable = v.status === 'AVAILABLE';
            const imgSrc = !brokenImages[v.id] ? resolveFleetImageUrl(v.imageUrl) : null;
            return (
              <div
                key={v.id}
                className="group bg-white border border-slate-300 hover:border-slate-500 shadow-xs transition-all flex flex-col justify-between overflow-hidden"
              >
                {/* Vehicle Photo */}
                <div className="h-44 w-full bg-slate-100 border-b border-slate-200 overflow-hidden flex items-center justify-center">
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={`${v.make} ${v.model}`}
                      onError={() => setBrokenImages((prev) => ({ ...prev, [v.id]: true }))}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-slate-400">
                      <Car className="w-8 h-8 text-slate-300" />
                      <span className="text-[10px] font-mono uppercase tracking-wider">No Photo</span>
                    </div>
                  )}
                </div>

                {/* Card Top */}
                <div className="p-5 space-y-3 flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold font-mono uppercase tracking-wider px-1.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-300">
                          {v.category}
                        </span>
                        <span className="text-xs font-mono text-slate-500">YEAR {v.year}</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-950 mt-1 uppercase font-mono">
                        {v.make} {v.model}
                      </h3>
                    </div>

                    <span
                      className={`text-[10px] font-bold uppercase font-mono px-2 py-0.5 border ${
                        isAvailable
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : v.status === 'MAINTENANCE'
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>

                  {/* Spec hints */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-200 font-mono">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Plate No.</span>
                      <span className="text-slate-900 font-bold">{v.plate}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Deposit Req.</span>
                      <span className="text-slate-900 font-medium">20% Refundable</span>
                    </div>
                  </div>
                </div>

                {/* Card Footer / Action */}
                <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-mono font-bold leading-tight">Daily Rate</span>
                    <span className="text-base font-bold text-slate-950 font-mono">${v.dailyRate.toFixed(2)}</span>
                    <span className="text-xs text-slate-500 font-mono"> / day</span>
                  </div>

                  <button
                    onClick={() => setBookingVehicle(v)}
                    disabled={!isAvailable}
                    className={`px-4 py-2 text-xs font-bold uppercase font-mono tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border ${
                      isAvailable
                        ? 'bg-slate-950 text-white border-slate-950 hover:bg-slate-800'
                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    }`}
                  >
                    {isAvailable ? (
                      <>
                        Reserve <ArrowUpRight className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      'Unavailable'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Booking Form Modal */}
      {bookingVehicle && (
        <BookingModal
          vehicle={bookingVehicle}
          onClose={() => setBookingVehicle(null)}
          onSuccess={(bId) => {
            setBookingVehicle(null);
            onOpenBookingSuccess(bId);
          }}
        />
      )}
    </div>
  );
};
