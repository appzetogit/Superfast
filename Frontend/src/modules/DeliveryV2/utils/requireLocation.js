import { toast } from 'sonner';
import { getNativeLocation } from '@shared/utils/nativeLocation';

/**
 * Fresh GPS fix needed before a rider goes online (zone gigs and dispatch depend on it).
 * Inside the app wrapper the native layer asks for permission and turns the phone's GPS on by itself;
 * in a browser we fall back to navigator.geolocation.
 * Resolves { ok: true, lat, lng } or { ok: false } after telling the rider how to turn location on.
 */
export async function requireLocation() {
  const native = await getNativeLocation();
  if (native) return { ok: true, lat: native.lat, lng: native.lng };

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    toast.error('Is device par location support nahi hai. Dusra device/browser use karein.');
    return { ok: false };
  }

  const result = await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => resolve({ ok: false, denied: err?.code === 1 }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });

  if (!result.ok) {
    // Open the same "Enable location" sheet that appears when the app starts.
    window.dispatchEvent(new CustomEvent('showLocationGate', { detail: { denied: Boolean(result.denied) } }));
  }
  return result;
}
