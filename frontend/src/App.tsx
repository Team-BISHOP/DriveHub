import { useState, useEffect, useCallback } from 'react';
import { Header, type TabType } from './components/Header';
import { VehiclesTab } from './components/VehiclesTab';
import { ReservationsTab } from './components/ReservationsTab';
import { CounterTab } from './components/CounterTab';
import { FleetTab } from './components/FleetTab';
import { EventsTab } from './components/EventsTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import type { Vehicle, Booking, Payment, NotificationItem, ServiceHealth } from './types';
import { fleetApi, bookingApi, paymentApi, notificationApi, checkAllHealth } from './api/client';
import logoImg from './assets/logo.png';

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('vehicles');
  const [refreshing, setRefreshing] = useState(false);

  // System states (5 Microservices)
  const [health, setHealth] = useState<ServiceHealth>({
    fleet: false,
    booking: false,
    payment: false,
    notification: false,
    analytics: false,
  });

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Fetch all data
  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const h = await checkAllHealth();
      setHealth(h);

      const promises: Promise<any>[] = [];

      if (h.fleet) {
        setLoadingVehicles(true);
        promises.push(
          fleetApi.getVehicles().then((res) => {
            setVehicles(res);
            setLoadingVehicles(false);
          }).catch(() => setLoadingVehicles(false))
        );
      }

      if (h.booking) {
        setLoadingBookings(true);
        promises.push(
          bookingApi.getBookings().then((res) => {
            setBookings(res);
            setLoadingBookings(false);
          }).catch(() => setLoadingBookings(false))
        );
      }

      if (h.payment) {
        promises.push(
          paymentApi.getPayments().then((res) => {
            setPayments(res);
          }).catch(() => {})
        );
      }

      if (h.notification) {
        setLoadingNotifications(true);
        promises.push(
          notificationApi.getNotifications().then((res) => {
            setNotifications(res);
            setLoadingNotifications(false);
          }).catch(() => setLoadingNotifications(false))
        );
      }

      await Promise.allSettled(promises);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBookingSuccess = (_bookingId: number) => {
    setActiveTab('reservations');
    loadData();
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 font-sans selection:bg-slate-950 selection:text-white">
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        health={health}
        refreshing={refreshing}
        onRefreshAll={loadData}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'vehicles' && (
          <VehiclesTab
            vehicles={vehicles}
            loading={loadingVehicles}
            onOpenBookingSuccess={handleBookingSuccess}
            onNavigateToFleet={() => setActiveTab('fleet')}
          />
        )}

        {activeTab === 'reservations' && (
          <ReservationsTab
            bookings={bookings}
            payments={payments}
            loading={loadingBookings}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'desk' && (
          <CounterTab
            bookings={bookings}
            vehicles={vehicles}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'fleet' && (
          <FleetTab
            vehicles={vehicles}
            loading={loadingVehicles}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'events' && (
          <EventsTab
            notifications={notifications}
            loading={loadingNotifications}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab onRefreshAll={loadData} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-300 mt-auto py-6 font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 bg-white border border-slate-300 flex items-center justify-center p-0.5">
              <img src={logoImg} alt="DriveHub" className="w-full h-full object-contain" />
            </div>
            <span>
              <strong className="text-slate-950 font-bold uppercase">DriveHub Enterprise</strong> • ITS4243 Microservices Architecture
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-slate-500 font-bold">
            <span className="bg-slate-100 px-2 py-0.5 border border-slate-300">Fleet :3001</span>
            <span className="bg-slate-100 px-2 py-0.5 border border-slate-300">Booking :3002</span>
            <span className="bg-slate-100 px-2 py-0.5 border border-slate-300">Payment :3003</span>
            <span className="bg-slate-100 px-2 py-0.5 border border-slate-300">Notify :3004</span>
            <span className="bg-slate-100 px-2 py-0.5 border border-slate-300">Analytics :3005</span>
            <span className="bg-slate-100 px-2 py-0.5 border border-slate-300">RabbitMQ :15672</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
