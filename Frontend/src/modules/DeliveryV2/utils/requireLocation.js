import { toast } from 'sonner';

/**
 * Fresh GPS fix needed before a rider goes online (zone gigs and dispatch depend on it).
 * Resolves { ok: true, lat, lng } or { ok: false } after telling the rider how to turn location on.
 */
export async function requireLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    toast.error('Is device par location support nahi hai. Dusra device/browser use karein.');
    return { ok: false };
  }

  const result = await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => resolve({ ok: false, denied: err?.code === 1 }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });

  if (!result.ok) {
    toast.error(
      result.denied
        ? 'Location permission blocked hai. App/browser settings me Location allow karein, phir online jayein.'
        : 'Location off hai. Phone ki Location (GPS) ON karein, phir online jayein.',
      { duration: 6000 }
    );
  }
  return result;
}
