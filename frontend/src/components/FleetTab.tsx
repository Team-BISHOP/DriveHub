import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Upload, Car, X } from 'lucide-react';
import type { Vehicle, VehicleStatus } from '../types';
import { fleetApi, resolveFleetImageUrl } from '../api/client';

interface FleetTabProps {
  vehicles: Vehicle[];
  loading: boolean;
  onRefresh: () => void;
}

const randomPlate = () => 'WP-CAB-' + Math.floor(1000 + Math.random() * 9000);

export const FleetTab: React.FC<FleetTabProps> = ({ vehicles, loading, onRefresh }) => {
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<Vehicle | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const [make, setMake] = useState('Toyota');
  const [model, setModel] = useState('Axio');
  const [year, setYear] = useState(2023);
  const [category, setCategory] = useState('CAR');
  const [plate, setPlate] = useState(randomPlate);
  const [dailyRate, setDailyRate] = useState(45);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const openAddModal = () => {
    setEditingVehicle(null);
    setMake('Toyota');
    setModel('Axio');
    setYear(2023);
    setCategory('CAR');
    setPlate(randomPlate());
    setDailyRate(45);
    setImageUrl('');
    setModalError(null);
    setModalMode('add');
  };

  const openEditModal = (v: Vehicle) => {
    setEditingVehicle(v);
    setMake(v.make);
    setModel(v.model);
    setYear(v.year);
    setCategory(v.category.toUpperCase());
    setPlate(v.plate);
    setDailyRate(v.dailyRate);
    setImageUrl(v.imageUrl ?? '');
    setModalError(null);
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingVehicle(null);
    setModalError(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setUploadingImage(true);
      setModalError(null);
      const { imageUrl: uploadedUrl } = await fleetApi.uploadImage(file);
      setImageUrl(uploadedUrl);
    } catch (err: any) {
      setModalError(err.message || 'Failed to upload image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleStatusChange = async (vehicleId: number, newStatus: VehicleStatus) => {
    try {
      setUpdatingId(vehicleId);
      setErrorMsg(null);
      await fleetApi.updateStatus(vehicleId, newStatus);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update vehicle status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setModalError(null);
      const trimmedImage = imageUrl.trim();
      const payload = {
        make: make.trim(),
        model: model.trim(),
        year: Number(year),
        category: category.trim().toUpperCase(),
        plate: plate.trim().toUpperCase(),
        dailyRate: Number(dailyRate),
        imageUrl: trimmedImage ? trimmedImage : null,
      };

      if (modalMode === 'edit' && editingVehicle) {
        await fleetApi.updateVehicle(editingVehicle.id, payload);
      } else {
        await fleetApi.createVehicle(payload);
      }
      closeModal();
      onRefresh();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save vehicle. Duplicate plate number or invalid input.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingVehicle) return;
    try {
      setUpdatingId(deletingVehicle.id);
      setErrorMsg(null);
      await fleetApi.deleteVehicle(deletingVehicle.id);
      setDeletingVehicle(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete vehicle.');
      setDeletingVehicle(null);
    } finally {
      setUpdatingId(null);
    }
  };

  const previewSrc = resolveFleetImageUrl(imageUrl.trim() || null);

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-slate-300 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase font-mono">Fleet Inventory Management</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Vendor portal for registering rental vehicles, configuring daily rates, and maintenance status.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto font-mono">
          {vehicles.length === 0 && (
            <button
              onClick={async () => {
                try {
                  setSubmitting(true);
                  const sampleCars = [
                    { make: 'Toyota', model: 'Aqua', year: 2022, category: 'CAR', plate: 'WP-CAB-1234', dailyRate: 40 },
                    { make: 'Honda', model: 'Vezel', year: 2023, category: 'SUV', plate: 'WP-CAG-5678', dailyRate: 65 },
                    { make: 'Toyota', model: 'HiAce', year: 2021, category: 'VAN', plate: 'WP-NA-9012', dailyRate: 85 },
                    { make: 'Toyota', model: 'Prius', year: 2023, category: 'CAR', plate: 'WP-CBA-3456', dailyRate: 50 },
                  ];
                  for (const c of sampleCars) {
                    await fleetApi.createVehicle(c).catch(() => {});
                  }
                  onRefresh();
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={submitting}
              className="px-3 py-2 text-xs font-bold uppercase text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer"
            >
              + Quick Seed Fleet
            </button>
          )}

          <button
            onClick={openAddModal}
            className="px-4 py-2 text-xs font-bold uppercase text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Vehicle
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-300 text-xs text-rose-900 font-mono flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold ml-2 cursor-pointer">✕</button>
        </div>
      )}

      {/* Fleet Table */}
      <div className="bg-white border border-slate-300 overflow-hidden shadow-xs font-mono">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Vehicle Details</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Plate No.</th>
                <th className="py-3.5 px-4">Daily Rate</th>
                <th className="py-3.5 px-4">Current Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading fleet records...
                  </td>
                </tr>
              ) : vehicles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No vehicles registered yet. Click "Add Vehicle" to register one.
                  </td>
                </tr>
              ) : (
                vehicles.map((v) => {
                  const thumbSrc = resolveFleetImageUrl(v.imageUrl);
                  return (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-10 bg-slate-100 border border-slate-300 shrink-0 overflow-hidden flex items-center justify-center">
                          {thumbSrc ? (
                            <img src={thumbSrc} alt={`${v.make} ${v.model}`} className="w-full h-full object-cover" />
                          ) : (
                            <Car className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-slate-950 uppercase">
                            {v.make} {v.model}
                          </div>
                          <span className="text-[11px] text-slate-500">Year {v.year} • ID #{v.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 font-bold">
                        {v.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-950">{v.plate}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-950">${v.dailyRate.toFixed(2)}/day</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase border ${
                          v.status === 'AVAILABLE'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : v.status === 'MAINTENANCE'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-slate-100 text-slate-800 border-slate-300'
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                        {v.status !== 'AVAILABLE' && (
                          <button
                            onClick={() => handleStatusChange(v.id, 'AVAILABLE')}
                            disabled={updatingId === v.id}
                            className="px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-colors cursor-pointer"
                          >
                            Set Available
                          </button>
                        )}
                        {v.status !== 'MAINTENANCE' && (
                          <button
                            onClick={() => handleStatusChange(v.id, 'MAINTENANCE')}
                            disabled={updatingId === v.id}
                            className="px-2.5 py-1 text-[11px] font-bold uppercase text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 transition-colors cursor-pointer"
                          >
                            Set Maintenance
                          </button>
                        )}
                        {v.status !== 'RETIRED' && (
                          <button
                            onClick={() => handleStatusChange(v.id, 'RETIRED')}
                            disabled={updatingId === v.id}
                            className="px-2.5 py-1 text-[11px] font-bold uppercase text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer"
                          >
                            Retire
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(v)}
                          disabled={updatingId === v.id}
                          title="Edit vehicle"
                          className="px-2.5 py-1 text-[11px] font-bold uppercase text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={() => setDeletingVehicle(v)}
                          disabled={updatingId === v.id}
                          title="Delete vehicle"
                          className="px-2.5 py-1 text-[11px] font-bold uppercase text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Vehicle Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs font-mono">
          <div className="bg-white max-w-md w-full border border-slate-400 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-300 bg-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-950">
                  {modalMode === 'edit' ? `Edit Vehicle #${editingVehicle?.id}` : 'Add Vehicle to Fleet'}
                </h3>
                <p className="text-xs text-slate-600">Fleet Service • PostgreSQL: fleetdb</p>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-500 hover:text-slate-950 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="p-6 space-y-3.5">
              {modalError && (
                <div className="p-2.5 bg-rose-50 border border-rose-300 text-xs text-rose-900">
                  {modalError}
                </div>
              )}

              {/* Vehicle Image Upload / URL */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase text-slate-700">Vehicle Photo</label>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-16 bg-slate-100 border border-slate-300 shrink-0 overflow-hidden flex items-center justify-center relative">
                    {previewSrc ? (
                      <img src={previewSrc} alt="Vehicle preview" className="w-full h-full object-cover" />
                    ) : (
                      <Car className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="px-3 py-1.5 text-[11px] font-bold uppercase bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 inline-flex items-center gap-1.5 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        {uploadingImage ? 'Uploading...' : 'Upload Image'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          disabled={uploadingImage}
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>
                      {imageUrl && (
                        <button
                          type="button"
                          onClick={() => setImageUrl('')}
                          className="px-2 py-1.5 text-[11px] font-bold uppercase text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-300 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3 h-3" /> Clear
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="Or paste https://... image URL"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Make</label>
                  <input
                    type="text"
                    required
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    placeholder="e.g. Toyota"
                    className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Model</label>
                  <input
                    type="text"
                    required
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. Aqua"
                    className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Year</label>
                  <input
                    type="number"
                    min={1990}
                    max={2100}
                    required
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
                  >
                    <option value="CAR">CAR (Sedan/Hatchback)</option>
                    <option value="SUV">SUV</option>
                    <option value="VAN">VAN</option>
                    <option value="BIKE">BIKE</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Plate Number</label>
                  <input
                    type="text"
                    required
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    placeholder="e.g. WP-CAB-1234"
                    className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Daily Rate ($)</label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    required
                    value={dailyRate}
                    onChange={(e) => setDailyRate(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-hidden focus:border-slate-950 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-xs font-bold uppercase text-slate-700 hover:text-slate-950 border border-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || uploadingImage}
                  className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-white bg-slate-950 border border-slate-950 hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Saving...' : modalMode === 'edit' ? 'Update Vehicle' : 'Save Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs font-mono">
          <div className="bg-white max-w-sm w-full border border-slate-400 shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-300 bg-rose-50 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-rose-950">Delete Vehicle</h3>
              <button
                onClick={() => setDeletingVehicle(null)}
                className="text-rose-700 hover:text-rose-950 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs text-slate-700">
              <p>
                Remove{' '}
                <span className="font-bold text-slate-950 uppercase">
                  {deletingVehicle.make} {deletingVehicle.model} ({deletingVehicle.plate})
                </span>{' '}
                from the fleet? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setDeletingVehicle(null)}
                  className="px-4 py-2 text-xs font-bold uppercase text-slate-700 border border-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={updatingId === deletingVehicle.id}
                  className="px-4 py-2 text-xs font-bold uppercase text-white bg-rose-700 hover:bg-rose-800 border border-rose-800 disabled:opacity-50 cursor-pointer"
                >
                  {updatingId === deletingVehicle.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
