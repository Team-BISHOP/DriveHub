export type VehicleCategory = 'CAR' | 'SUV' | 'VAN' | 'COMPACT' | 'SEDAN';
export type VehicleStatus = 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED';

export interface Vehicle {
  id: number;
  make: string;
  model: string;
  year: number;
  category: string;
  plate: string;
  dailyRate: number;
  status: VehicleStatus;
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'PICKED_UP' | 'RETURNED' | 'CANCELLED';

export interface Booking {
  id: number;
  vehicleId: number;
  customerName: string;
  customerEmail: string;
  startDate: string;
  endDate: string;
  dailyRate: number;
  totalPrice: number;
  deposit: number;
  lateFee: number;
  status: BookingStatus;
  pickedUpAt: string | null;
  returnedAt: string | null;
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'DEPOSIT_RETURNED' | 'REFUNDED';

export interface Payment {
  id: number;
  bookingId: number;
  customerEmail: string;
  amount: number;
  deposit: number;
  refundAmount: number;
  status: PaymentStatus;
  method: string | null;
}

export interface NotificationItem {
  id: number;
  event: string;
  bookingId: number | null;
  recipient?: string | null;
  customerEmail?: string | null;
  message: string;
  sentAt?: string;
  createdAt?: string;
}

export interface AnalyticsSummary {
  grossRevenue: number;
  totalRefunds: number;
  netRevenue: number;
  lateFeesCollected: number;
  totalBookings: number;
  confirmedBookings: number;
  activeRentals: number;
  completedRentals: number;
  cancelledBookings: number;
  failedPayments: number;
  fleetTotal: number;
  fleetUtilization: number;
}

export interface EventThroughput {
  event: string;
  count: number;
  lastOccurred: string;
}

export interface FinancialTransaction {
  id: number;
  event: string;
  bookingId: number;
  customerEmail: string;
  amount: number;
  createdAt: string;
}

export interface ServiceHealth {
  fleet: boolean;
  booking: boolean;
  payment: boolean;
  notification: boolean;
  analytics: boolean;
}
