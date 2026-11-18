# DriveHub Web Client

Modern, clean, and responsive frontend interface for the DriveHub Vehicle Rental Microservices platform. Built with React 19, TypeScript, Vite, and Tailwind CSS.

## Running the Web App

Make sure the DriveHub backend microservices are up and running:
```bash
# In the repository root
docker compose up
```

Then in a new terminal, launch the frontend:
```bash
cd frontend
npm run dev
```

Open your browser at: **http://localhost:5173**

## Features & Scenarios

- **Explore & Reserve:** Real-time availability check, date range selection, automatic 20% security deposit calculation.
- **Reservations & Payments:** Complete card checkout (demo decline rule: cards ending in `0000`), view confirmation, cancel bookings.
- **Rental Counter Desk:** Counter staff operations to mark key handover (`PICKED_UP`) and handle returns (`RETURNED`) with automated late fee calculation (1.5x daily rate) and deposit refund settlement.
- **Fleet Management:** Add new vehicles to fleet, toggle `AVAILABLE` vs `MAINTENANCE` status.
- **Live Event Stream:** Live audit feed of RabbitMQ events (`drivehub.events`) received by Notification Service.
