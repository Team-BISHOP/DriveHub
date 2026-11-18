import type {
  Vehicle,
  Booking,
  Payment,
  NotificationItem,
  AnalyticsSummary,
  EventThroughput,
  FinancialTransaction,
  ServiceHealth,
} from '../types';

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || (typeof data === 'string' ? data : `Request failed with status ${res.status}`);
    throw new Error(errorMsg);
  }

  return data as T;
}

// ---------------- Fleet API ----------------
export const fleetApi = {
  checkHealth: async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/fleet/health');
      return res.ok;
    } catch {
      return false;
    }
  },

  getVehicles: async (status?: string): Promise<Vehicle[]> => {
    const url = status ? `/api/fleet/vehicles?status=${encodeURIComponent(status)}` : '/api/fleet/vehicles';
    const res = await fetch(url);
    return handleResponse<Vehicle[]>(res);
  },

  getVehicle: async (id: number): Promise<Vehicle> => {
    const res = await fetch(`/api/fleet/vehicles/${id}`);
    return handleResponse<Vehicle>(res);
  },

  createVehicle: async (payload: {
    make: string;
    model: string;
    year: number;
    category: string;
    plate: string;
    dailyRate: number;
  }): Promise<Vehicle> => {
    const res = await fetch('/api/fleet/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<Vehicle>(res);
  },

  updateStatus: async (id: number, status: 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED'): Promise<Vehicle> => {
    const res = await fetch(`/api/fleet/vehicles/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return handleResponse<Vehicle>(res);
  },
};

// ---------------- Booking API ----------------
export const bookingApi = {
  checkHealth: async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/booking/health');
      return res.ok;
    } catch {
      return false;
    }
  },

  getBookings: async (params?: { customerEmail?: string; status?: string }): Promise<Booking[]> => {
    const query = new URLSearchParams();
    if (params?.customerEmail) query.set('customerEmail', params.customerEmail);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    const res = await fetch(`/api/booking/bookings${qs ? '?' + qs : ''}`);
    return handleResponse<Booking[]>(res);
  },

  createBooking: async (payload: {
    vehicleId: number;
    customerName: string;
    customerEmail: string;
    startDate: string;
    endDate: string;
  }): Promise<Booking> => {
    const res = await fetch('/api/booking/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<Booking>(res);
  },

  getBooking: async (id: number): Promise<Booking> => {
    const res = await fetch(`/api/booking/bookings/${id}`);
    return handleResponse<Booking>(res);
  },

  pickupBooking: async (id: number): Promise<Booking> => {
    const res = await fetch(`/api/booking/bookings/${id}/pickup`, {
      method: 'POST',
    });
    return handleResponse<Booking>(res);
  },

  returnBooking: async (id: number, returnDate?: string): Promise<Booking> => {
    const res = await fetch(`/api/booking/bookings/${id}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(returnDate ? { returnDate } : {}),
    });
    return handleResponse<Booking>(res);
  },

  cancelBooking: async (id: number): Promise<Booking> => {
    const res = await fetch(`/api/booking/bookings/${id}/cancel`, {
      method: 'POST',
    });
    return handleResponse<Booking>(res);
  },
};

// ---------------- Payment API ----------------
export const paymentApi = {
  checkHealth: async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/payment/health');
      return res.ok;
    } catch {
      return false;
    }
  },

  getPayments: async (bookingId?: number): Promise<Payment[]> => {
    const url = bookingId ? `/api/payment/payments?bookingId=${bookingId}` : '/api/payment/payments';
    const res = await fetch(url);
    return handleResponse<Payment[]>(res);
  },

  getPayment: async (id: number): Promise<Payment> => {
    const res = await fetch(`/api/payment/payments/${id}`);
    return handleResponse<Payment>(res);
  },

  processPayment: async (
    paymentId: number,
    payload: { method: 'CARD' | 'CASH'; cardNumber?: string }
  ): Promise<Payment> => {
    const res = await fetch(`/api/payment/payments/${paymentId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<Payment>(res);
  },
};

// ---------------- Notification API ----------------
export const notificationApi = {
  checkHealth: async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/notification/health');
      return res.ok;
    } catch {
      return false;
    }
  },

  getNotifications: async (bookingId?: number): Promise<NotificationItem[]> => {
    const url = bookingId ? `/api/notification/notifications?bookingId=${bookingId}` : '/api/notification/notifications';
    const res = await fetch(url);
    return handleResponse<NotificationItem[]>(res);
  },
};

// ---------------- Analytics API ----------------
export const analyticsApi = {
  checkHealth: async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/analytics/health');
      return res.ok;
    } catch {
      return false;
    }
  },

  getSummary: async (): Promise<AnalyticsSummary> => {
    const res = await fetch('/api/analytics/summary');
    return handleResponse<AnalyticsSummary>(res);
  },

  getEvents: async (): Promise<EventThroughput[]> => {
    const res = await fetch('/api/analytics/events');
    return handleResponse<EventThroughput[]>(res);
  },

  getFinancialStream: async (): Promise<FinancialTransaction[]> => {
    const res = await fetch('/api/analytics/financial-stream');
    return handleResponse<FinancialTransaction[]>(res);
  },
};

// Combined health checker
export async function checkAllHealth(): Promise<ServiceHealth> {
  const [fleet, booking, payment, notification, analytics] = await Promise.all([
    fleetApi.checkHealth(),
    bookingApi.checkHealth(),
    paymentApi.checkHealth(),
    notificationApi.checkHealth(),
    analyticsApi.checkHealth(),
  ]);
  return { fleet, booking, payment, notification, analytics };
}
