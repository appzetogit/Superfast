const CHECK_IN_EARLY_MS = 30 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');

const normalizeTime = (value) => {
  const [h, m] = String(value || '').split(':').map((n) => Number(n) || 0);
  return `${pad(h)}:${pad(m)}`;
};

// Shift times are entered in IST (same rule as the backend).
const getShiftWindow = (gig) => {
  if (!gig?.date || !gig?.startTime || !gig?.endTime) return null;
  const start = new Date(`${gig.date}T${normalizeTime(gig.startTime)}:00+05:30`);
  const end = new Date(`${gig.date}T${normalizeTime(gig.endTime)}:00+05:30`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  return { start, end };
};

/** Booking whose shift is running now (or opens within 30 min); a future/ended booking does not count. */
export function findRunningBooking(bookings = []) {
  const now = Date.now();
  return (
    bookings.find((b) => {
      if (b.status !== 'booked' && b.status !== 'checked_in') return false;
      const w = getShiftWindow(b.gigId);
      return w && now >= w.start.getTime() - CHECK_IN_EARLY_MS && now < w.end.getTime();
    }) || null
  );
}
