// End-to-end smoke test for the whole system. Needs Node 22+ and `docker compose up` running.
// Run:  node scripts/e2e.mjs
const FLEET = process.env.FLEET ?? "http://localhost:3001";
const BOOKING = process.env.BOOKING ?? "http://localhost:3002";
const PAYMENT = process.env.PAYMENT ?? "http://localhost:3003";
const NOTIFY = process.env.NOTIFY ?? "http://localhost:3004";
const ANALYTICS = process.env.ANALYTICS ?? "http://localhost:3005";

let failed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`);
  if (!ok) failed++;
};
async function call(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
// Events travel through RabbitMQ, so poll until the expected state shows up.
async function waitFor(fn, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(300);
  }
  return null;
}

const plate = "E2E-" + Date.now();

// Scenario 3: fleet
const car = await call("POST", `${FLEET}/vehicles`, {
  make: "Toyota",
  model: "Aqua",
  year: 2022,
  category: "CAR",
  plate,
  dailyRate: 40,
});
check(
  "fleet: create vehicle",
  car.status === 201 && car.body.status === "AVAILABLE",
  JSON.stringify(car.body),
);
const dup = await call("POST", `${FLEET}/vehicles`, {
  make: "Toyota",
  model: "Aqua",
  year: 2022,
  category: "CAR",
  plate,
  dailyRate: 40,
});
check("fleet: duplicate plate rejected", dup.status === 409);
const bad = await call("POST", `${FLEET}/vehicles`, { make: "X" });
check("fleet: validation error", bad.status === 400);

// Scenario 1: booking
const input = {
  vehicleId: car.body.id,
  customerName: "Nimal Perera",
  customerEmail: "nimal@example.com",
  startDate: "2030-01-10",
  endDate: "2030-01-13",
};
const bk = await call("POST", `${BOOKING}/bookings`, input);
check(
  "booking: create (3 days x 40 = 120, deposit 24)",
  bk.status === 201 &&
    bk.body.status === "PENDING" &&
    bk.body.totalPrice === 120 &&
    bk.body.deposit === 24,
  JSON.stringify(bk.body),
);
const clash = await call("POST", `${BOOKING}/bookings`, {
  ...input,
  startDate: "2030-01-12",
  endDate: "2030-01-15",
});
check("booking: overlapping dates rejected (409)", clash.status === 409);
const ghost = await call("POST", `${BOOKING}/bookings`, {
  ...input,
  vehicleId: 999999,
});
check("booking: unknown vehicle (404)", ghost.status === 404);
const early = await call("POST", `${BOOKING}/bookings/${bk.body.id}/pickup`);
check("booking: cannot pick up before payment (409)", early.status === 409);

// Scenario 2: payment
const pay = await waitFor(async () => {
  const r = await call("GET", `${PAYMENT}/payments?bookingId=${bk.body.id}`);
  return r.body?.[0];
});
check(
  "payment: request created from booking.created event (amount 144)",
  pay && pay.status === "PENDING" && pay.amount === 144,
  JSON.stringify(pay),
);
const declined = await call("POST", `${PAYMENT}/payments/${pay.id}/pay`, {
  method: "CARD",
  cardNumber: "4000000000000000",
});
check(
  "payment: card ending 0000 declined (402)",
  declined.status === 402 && declined.body.status === "FAILED",
);
const paid = await call("POST", `${PAYMENT}/payments/${pay.id}/pay`, {
  method: "CARD",
  cardNumber: "4242424242424242",
});
check(
  "payment: retry succeeds",
  paid.status === 200 && paid.body.status === "PAID",
);
const again = await call("POST", `${PAYMENT}/payments/${pay.id}/pay`, {
  method: "CARD",
  cardNumber: "4242424242424242",
});
check("payment: cannot pay twice (409)", again.status === 409);

const confirmed = await waitFor(async () => {
  const r = await call("GET", `${BOOKING}/bookings/${bk.body.id}`);
  return r.body.status === "CONFIRMED" ? r.body : null;
});
check("booking: becomes CONFIRMED after payment event", !!confirmed);

// Scenario 4: pickup and late return (end date 2030-01-13, return 2030-01-15 = 2 days late)
const pick = await call("POST", `${BOOKING}/bookings/${bk.body.id}/pickup`);
check(
  "booking: pickup",
  pick.status === 200 && pick.body.status === "PICKED_UP",
);
const ret = await call("POST", `${BOOKING}/bookings/${bk.body.id}/return`, {
  returnDate: "2030-01-15",
});
check(
  "booking: late return fee (2 days x 40 x 1.5 = 120)",
  ret.status === 200 &&
    ret.body.status === "RETURNED" &&
    ret.body.lateFee === 120,
  JSON.stringify(ret.body),
);
const refunded = await waitFor(async () => {
  const r = await call("GET", `${PAYMENT}/payments/${pay.id}`);
  return r.body.status === "DEPOSIT_RETURNED" ? r.body : null;
});
check(
  "payment: deposit (24) minus late fee (120) = refund 0",
  refunded && refunded.refundAmount === 0,
  JSON.stringify(refunded),
);

// Cancel flow: pay, then cancel, expect a full refund
const bk2 = await call("POST", `${BOOKING}/bookings`, {
  ...input,
  startDate: "2030-02-01",
  endDate: "2030-02-03",
});
const pay2 = await waitFor(
  async () =>
    (await call("GET", `${PAYMENT}/payments?bookingId=${bk2.body.id}`))
      .body?.[0],
);
await call("POST", `${PAYMENT}/payments/${pay2.id}/pay`, { method: "CASH" });
await waitFor(
  async () =>
    (await call("GET", `${BOOKING}/bookings/${bk2.body.id}`)).body.status ===
    "CONFIRMED",
);
const cancel = await call("POST", `${BOOKING}/bookings/${bk2.body.id}/cancel`);
check(
  "booking: cancel",
  cancel.status === 200 && cancel.body.status === "CANCELLED",
);
const full = await waitFor(async () => {
  const r = await call("GET", `${PAYMENT}/payments/${pay2.id}`);
  return r.body.status === "REFUNDED" ? r.body : null;
});
check(
  "payment: full refund after cancel",
  full && full.refundAmount === full.amount,
  JSON.stringify(full),
);
const rebook = await call("POST", `${BOOKING}/bookings`, {
  ...input,
  startDate: "2030-02-01",
  endDate: "2030-02-03",
});
check("booking: dates free again after cancel", rebook.status === 201);

// Scenario 3 again: vehicle in maintenance cannot be booked
await call("PATCH", `${FLEET}/vehicles/${car.body.id}/status`, {
  status: "MAINTENANCE",
});
const maint = await call("POST", `${BOOKING}/bookings`, {
  ...input,
  startDate: "2030-03-01",
  endDate: "2030-03-02",
});
check("booking: vehicle in MAINTENANCE rejected (409)", maint.status === 409);

// Scenario 5: notifications
const notes = await waitFor(async () => {
  const r = await call(
    "GET",
    `${NOTIFY}/notifications?bookingId=${bk.body.id}`,
  );
  return r.body.length >= 7 ? r.body : null;
});
const events = notes ? notes.map((n) => n.event) : [];
check(
  "notifications: full event trail recorded for booking 1",
  !!notes,
  JSON.stringify(events),
);
if (notes) console.log("      " + events.join(" -> "));

// Analytics verification
const analytics = await waitFor(async () => {
  const r = await call("GET", `${ANALYTICS}/analytics/summary`);
  return r.status === 200 && r.body.totalBookings > 0 ? r.body : null;
});
check("analytics: aggregated summary and revenue", !!analytics, JSON.stringify(analytics));

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
