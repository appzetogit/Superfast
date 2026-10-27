import mongoose from 'mongoose';
import { Gig } from '../models/gig.model.js';
import { GigBooking } from '../models/gigBooking.model.js';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { HandoverRequest } from '../models/handoverRequest.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodZone } from '../../admin/models/zone.model.js';
import { notifyOwnerSafely, notifyAdminsSafely } from '../../../../core/notifications/firebase.service.js';
import { createInboxNotifications } from '../../../../core/notifications/notification.service.js';
import { tryAutoAssign } from '../../orders/services/order-dispatch.service.js';
import { getIO, rooms } from '../../../../config/socket.js';

/** Helper: Get delivery partner ID safely from req.user */
function getDeliveryPartnerId(req) {
  const id = req.user?.userId || req.user?.id || req.user?._id || req.user?.deliveryPartnerId;
  return id ? String(id) : null;
}

/** Helper: Get today YYYY-MM-DD */
function getTodayDateString() {
  // en-CA formats as YYYY-MM-DD; pinned to IST so a UTC server does not roll the date at 05:30.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/** Zone helpers: a rider may only see/book gigs of the zone they are physically in. */
const normZone = (s) => String(s || '').replace(/\s*zone\s*$/i, '').trim().toLowerCase();
const isGlobalGigZone = (s) => ['', 'all', 'all zones', 'all areas / zones', 'general'].includes(normZone(s));

function pointInPolygon(lat, lng, coords) {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const yi = coords[i].latitude, xi = coords[i].longitude;
    const yj = coords[j].latitude, xj = coords[j].longitude;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Normalised names of the active zones the rider is in (empty = unknown).
 * `live` ({ lat, lng } sent by the app) wins over the last saved location, which
 * can be stale (e.g. rider went offline in Dewas and is now in Sanchore).
 */
async function getPartnerZoneNames(partner, live = null) {
  const liveLat = Number(live?.lat);
  const liveLng = Number(live?.lng);
  const hasLive = live?.lat != null && live?.lng != null && Number.isFinite(liveLat) && Number.isFinite(liveLng)
    && Math.abs(liveLat) <= 90 && Math.abs(liveLng) <= 180;
  const lat = hasLive ? liveLat : Number(partner?.lastLat);
  const lng = hasLive ? liveLng : Number(partner?.lastLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return new Set();
  const zones = await FoodZone.find({ isActive: true }).select('name zoneName coordinates').lean();
  const names = new Set();
  for (const z of zones) {
    if (Array.isArray(z.coordinates) && z.coordinates.length >= 3 && pointInPolygon(lat, lng, z.coordinates)) {
      names.add(normZone(z.name));
      if (z.zoneName) names.add(normZone(z.zoneName));
    }
  }
  return names;
}

/**
 * Zones the rider may use: the zone(s) they are physically in, or - when the GPS fix is missing or
 * outside every drawn zone polygon - the zone/city saved on their profile. Without this fallback an
 * Indore rider with GPS off (or standing just outside the polygon) only saw all-zone gigs.
 */
const effectiveZoneNames = (partner, physicalZones) => {
  if (physicalZones && physicalZones.size > 0) return physicalZones;
  const names = new Set();
  for (const v of [partner?.zoneName, partner?.city]) {
    const n = normZone(v);
    if (n) names.add(n);
  }
  return names;
};

const gigAllowedForZones = (gig, zoneNames) =>
  isGlobalGigZone(gig?.zoneName) || zoneNames.has(normZone(gig?.zoneName));

const TERMINAL_ORDER_STATUSES = [
  'delivered',
  'cancelled_by_user',
  'cancelled_by_restaurant',
  'cancelled_by_admin',
];
const CHECK_IN_EARLY_MINUTES = 30;

/** Helper: "8:0" / "08:00" -> "08:00" */
function normalizeTime(value) {
  const [h, m] = String(value || '').split(':').map((n) => Number(n) || 0);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Helper: absolute start/end Date of a gig shift (overnight shifts roll to next day) */
function getShiftWindow(gig) {
  if (!gig?.date || !gig?.startTime || !gig?.endTime) return null;
  // Shift times are entered in IST; parse them as IST regardless of the server timezone.
  const start = new Date(`${gig.date}T${normalizeTime(gig.startTime)}:00+05:30`);
  const end = new Date(`${gig.date}T${normalizeTime(gig.endTime)}:00+05:30`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  return { start, end };
}

/** Booking whose shift is running now (or starts within the check-in window); null if none. */
export async function findRunningGigBooking(partnerObjectId) {
  const now = Date.now();
  const bookings = await GigBooking.find({
    deliveryPartnerId: partnerObjectId,
    status: { $in: ['booked', 'checked_in'] },
  }).populate('gigId').lean();
  return (
    bookings.find((b) => {
      const w = getShiftWindow(b.gigId);
      return w && now >= w.start.getTime() - CHECK_IN_EARLY_MINUTES * 60 * 1000 && now < w.end.getTime();
    }) || null
  );
}

/** Helper: does the rider still have an undelivered accepted order? */
async function partnerHasActiveOrder(partnerObjectId) {
  const count = await FoodOrder.countDocuments({
    'dispatch.deliveryPartnerId': partnerObjectId,
    'dispatch.status': 'accepted',
    orderStatus: { $nin: TERMINAL_ORDER_STATUSES },
  });
  return count > 0;
}

/** Helper: send push + inbox + socket for a gig event to one rider. */
async function notifyPartnerGigEvent(partnerId, { title, body, type, gigId, socketEvent, extra = {} }) {
  const ownerId = String(partnerId);
  await notifyOwnerSafely(
    { ownerType: 'DELIVERY_PARTNER', ownerId },
    { title, body, data: { type, gigId: String(gigId || ''), link: '/food/delivery' } }
  );
  try {
    await createInboxNotifications({
      notifications: [
        { ownerType: 'DELIVERY_PARTNER', ownerId, title, message: body, category: 'gig_reminder', metadata: { gigId: String(gigId || ''), type } },
      ],
    });
  } catch (err) {
    console.warn('[Gig] inbox notification failed:', err?.message || err);
  }
  try {
    const io = getIO();
    if (io && socketEvent) io.to(rooms.delivery(ownerId)).emit(socketEvent, { gigId, title, message: body, ...extra });
  } catch {
    // socket is best-effort
  }
}

/**
 * Close out stale bookings:
 * - booked but shift ended     -> missed
 * - checked_in and shift ended -> completed (unless the rider still has an active order)
 */
export async function expireGigBookings() {
  try {
    const now = Date.now();
    const open = await GigBooking.find({ status: { $in: ['booked', 'checked_in'] } })
      .populate('gigId')
      .lean();

    for (const booking of open) {
      const window = getShiftWindow(booking.gigId);
      if (!window || window.end.getTime() > now) continue;

      if (booking.status === 'booked') {
        await GigBooking.updateOne({ _id: booking._id, status: 'booked' }, { $set: { status: 'missed' } });
        continue;
      }

      if (await partnerHasActiveOrder(booking.deliveryPartnerId)) continue;
      await GigBooking.updateOne(
        { _id: booking._id, status: 'checked_in' },
        { $set: { status: 'completed', checkOutTime: new Date() } }
      );
    }
  } catch (error) {
    console.error('[Gig] expire bookings error:', error);
  }
}

/**
 * Shift-end auto-offline: an online rider with no running (or starting within
 * 30 min) booking and no active order is set offline and told why. The socket
 * event lets the open app flip its toggle instead of showing a stale "online".
 */
export async function autoOfflineEndedShifts() {
  // Offline is driven only by the gig window (not by app background / stale pings).
  try {
    const now = Date.now();
    const onlinePartners = await FoodDeliveryPartner.find({ availabilityStatus: 'online' }).select('_id').lean();

    for (const partner of onlinePartners) {
      const bookings = await GigBooking.find({
        deliveryPartnerId: partner._id,
        status: { $in: ['booked', 'checked_in'] },
      }).populate('gigId').lean();

      const hasActiveGig = bookings.some((b) => {
        const w = getShiftWindow(b.gigId);
        return w && now >= w.start.getTime() - CHECK_IN_EARLY_MINUTES * 60 * 1000 && now < w.end.getTime();
      });
      if (hasActiveGig) continue;
      if (await partnerHasActiveOrder(partner._id)) continue;

      const flipped = await FoodDeliveryPartner.updateOne(
        { _id: partner._id, availabilityStatus: 'online' },
        { $set: { availabilityStatus: 'offline' } }
      );
      if (!flipped.modifiedCount) continue;

      await notifyPartnerGigEvent(partner._id, {
        title: 'Shift Ended - You are now Offline',
        body: 'Aapki gig end ho gayi hai, aap offline ho gaye hain. Orders paane ke liye nayi gig book karke online jaayein.',
        type: 'GIG_SHIFT_ENDED',
        socketEvent: 'availability_status_changed',
        extra: { availabilityStatus: 'offline', reason: 'gig_expired' },
      });
    }
  } catch (error) {
    console.error('[Gig] auto-offline error:', error);
  }
}

const GPS_STALE_MS = 5 * 60 * 1000;
const GPS_ALERT_REPEAT_MS = 15 * 60 * 1000;
const lastGpsAlertAt = new Map(); // partnerId -> ms of the last "turn GPS on" alert

/**
 * Ask a rider to switch their GPS on (push + inbox + socket).
 * Note: Disabled auto-spam to prevent false alerts when riders are stationary or phone is locked.
 */
async function sendGpsOffAlert(partnerId) {
  return false;
}

/** Online riders stale GPS alert - disabled to prevent false push notifications when device is stationary or screen is locked */
export async function alertStaleGpsPartners() {
  return;
}

const REMINDER_30_MS = 30 * 60 * 1000;
const REMINDER_15_MS = 15 * 60 * 1000;

/**
 * Pre-shift reminders, each fired exactly once per booking (DB flag, claimed atomically):
 * - 30 min before start: only if the rider is still offline
 * - 15 min before start: always
 * Also expires old bookings and auto-offlines riders whose shift ended.
 */
export async function checkAndSendGigReminders() {
  try {
    await expireGigBookings();
    await autoOfflineEndedShifts();

    const bookings = await GigBooking.find({ status: 'booked' })
      .populate('gigId')
      .populate('deliveryPartnerId', 'availabilityStatus')
      .lean();

    const now = Date.now();

    for (const booking of bookings) {
      const gig = booking.gigId;
      const partner = booking.deliveryPartnerId;
      if (!gig || !gig.isActive || !partner) continue;

      const window = getShiftWindow(gig);
      if (!window) continue;

      const untilStart = window.start.getTime() - now;
      if (untilStart <= 0) continue;

      if (!booking.reminder30MinSent && untilStart <= REMINDER_30_MS && partner.availabilityStatus !== 'online') {
        const claimed = await GigBooking.updateOne(
          { _id: booking._id, reminder30MinSent: { $ne: true } },
          { $set: { reminder30MinSent: true } }
        );
        if (claimed.modifiedCount) {
          await notifyPartnerGigEvent(partner._id, {
            title: 'Upcoming Shift Reminder (30m)',
            body: `Your booked shift "${gig.title}" starts in 30 minutes (${gig.startTime}). Please get ready!`,
            type: 'GIG_REMINDER_30MIN',
            gigId: gig._id,
            socketEvent: 'gig:reminder_30min',
            extra: { startTime: gig.startTime },
          });
        }
      }

      if (!booking.reminder15MinSent && untilStart <= REMINDER_15_MS) {
        const claimed = await GigBooking.updateOne(
          { _id: booking._id, reminder15MinSent: { $ne: true } },
          { $set: { reminder15MinSent: true } }
        );
        if (claimed.modifiedCount) {
          await notifyPartnerGigEvent(partner._id, {
            title: 'Shift Starting Soon (15m)',
            body: `Your shift "${gig.title}" starts in 15 minutes (${gig.startTime}). Please log in and go online now!`,
            type: 'GIG_REMINDER_15MIN',
            gigId: gig._id,
            socketEvent: 'gig:reminder_15min',
            extra: { startTime: gig.startTime },
          });
        }
      }
    }
  } catch (error) {
    console.error('[Gig] Reminder check error:', error);
  }
}

// Reminder / expiry / shift-end check every minute
setInterval(checkAndSendGigReminders, 60 * 1000).unref?.();

/**
 * List active Gigs created by Admin for driver's zone and date
 */
export async function listZoneGigsController(req, res) {
  try {
    const deliveryPartnerId = getDeliveryPartnerId(req);
    let { zoneName, date = getTodayDateString() } = req.query;

    let partner = null;
    if (deliveryPartnerId && mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
      partner = await FoodDeliveryPartner.findById(deliveryPartnerId).lean();
    }

    // Partners have no reliable zone (only a free-text city), so without an explicit zone we
    // list every active gig for the date instead of hiding gigs behind a name mismatch.
    const driverZone = partner?.zoneName || partner?.city || null;
    if (!zoneName) zoneName = 'ALL ZONES';

    const query = { isActive: true };

    if (date && date !== 'ALL DATES' && date !== 'ALL' && date !== '') {
      query.date = date;
    }

    // A rider only sees gigs of the zone they are in (plus gigs open to all zones).
    // If their zone can't be determined (no location yet / outside every zone) only
    // all-zone gigs are shown, never another zone's.
    const partnerZones = await getPartnerZoneNames(partner, { lat: req.query.lat, lng: req.query.lng });
    const locationSource = req.query.lat != null && req.query.lng != null
      ? 'live'
      : partner?.lastLat != null && partner?.lastLng != null ? 'saved' : 'none';
    const allGigs = await Gig.find(query)
      .sort({ startTime: 1 })
      .lean();
    const gigs = allGigs.filter((g) => gigAllowedForZones(g, effectiveZoneNames(partner, partnerZones)));

    // Cross reference driver's existing bookings
    let userBookings = [];
    if (deliveryPartnerId && mongoose.Types.ObjectId.isValid(deliveryPartnerId) && gigs.length > 0) {
      const partnerObjectId = new mongoose.Types.ObjectId(deliveryPartnerId);
      userBookings = await GigBooking.find({
        deliveryPartnerId: partnerObjectId,
        gigId: { $in: gigs.map((g) => g._id) },
        status: { $ne: 'cancelled' },
      }).lean();
    }

    const bookingMap = new Map(userBookings.map((b) => [String(b.gigId), b]));

    const enrichedGigs = gigs.map((g) => {
      const userBooking = bookingMap.get(String(g._id));
      return {
        ...g,
        slotsLeft: Math.max(0, g.maxDrivers - (g.bookedCount || 0)),
        isBooked: Boolean(userBooking),
        bookingStatus: userBooking ? userBooking.status : null,
        bookingId: userBooking ? userBooking._id : null,
        checkInTime: userBooking ? userBooking.checkInTime : null,
      };
    });

    return res.json({
      success: true,
      data: {
        zoneName,
        driverZone: driverZone || zoneName,
        // Zones the rider was located in for this request, so the app can explain an empty list.
        riderZones: [...partnerZones],
        locationSource,
        date,
        gigs: enrichedGigs,
      },
    });
  } catch (error) {
    console.error('[Gig] listZoneGigs error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to list gigs' });
  }
}

/**
 * Book a Gig Slot
 */
export async function bookGigController(req, res) {
  let slotClaimed = false;
  let claimedGigId = null;
  try {
    const deliveryPartnerId = getDeliveryPartnerId(req);
    const { gigId } = req.body;

    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
      return res.status(401).json({ success: false, message: 'Invalid or missing delivery partner session' });
    }

    if (!gigId || !mongoose.Types.ObjectId.isValid(gigId)) {
      return res.status(400).json({ success: false, message: 'Valid Gig ID is required' });
    }

    const gig = await Gig.findById(gigId);
    if (!gig || !gig.isActive) {
      return res.status(404).json({ success: false, message: 'Gig shift not found or inactive' });
    }

    const window = getShiftWindow(gig);
    if (window && window.end.getTime() <= Date.now()) {
      return res.status(400).json({ success: false, message: 'This Gig shift has already ended' });
    }

    const bookingPartner = await FoodDeliveryPartner.findById(deliveryPartnerId).select('lastLat lastLng zoneName city adminForceOffline').lean();
    const bookingZones = await getPartnerZoneNames(bookingPartner, { lat: req.body.lat, lng: req.body.lng });
    if (!gigAllowedForZones(gig, effectiveZoneNames(bookingPartner, bookingZones))) {
      return res.status(403).json({
        success: false,
        message: `This gig is only for the ${gig.zoneName} zone. You can book gigs in the zone you are currently in.`,
      });
    }

    const partnerObjectId = new mongoose.Types.ObjectId(deliveryPartnerId);

    // Do not allow two overlapping shifts for the same rider.
    if (window) {
      const myOpen = await GigBooking.find({
        deliveryPartnerId: partnerObjectId,
        gigId: { $ne: gig._id },
        status: { $in: ['booked', 'checked_in'] },
      }).populate('gigId').lean();

      const clash = myOpen.find((b) => {
        const w = getShiftWindow(b.gigId);
        return w && w.start < window.end && window.start < w.end;
      });
      if (clash) {
        return res.status(400).json({
          success: false,
          message: `You already have a shift booked at this time (${clash.gigId?.title || 'another gig'}, ${clash.gigId?.startTime}-${clash.gigId?.endTime})`,
        });
      }
    }

    // Check existing booking for this gig to handle re-booking cleanly
    const existing = await GigBooking.findOne({
      gigId: gig._id,
      deliveryPartnerId: partnerObjectId,
    });

    if (existing && !['cancelled', 'missed'].includes(existing.status)) {
      return res.status(400).json({
        success: false,
        message: existing.status === 'completed'
          ? 'You have already completed this Gig shift'
          : 'You have already booked this Gig shift',
      });
    }

    // Atomically claim a slot so concurrent riders cannot overbook.
    const claimed = await Gig.findOneAndUpdate(
      {
        _id: gig._id,
        isActive: true,
        $expr: { $lt: [{ $ifNull: ['$bookedCount', 0] }, { $ifNull: ['$maxDrivers', 0] }] },
      },
      { $inc: { bookedCount: 1 } },
      { new: true }
    );
    if (!claimed) {
      return res.status(400).json({ success: false, message: 'No slots available for this Gig shift' });
    }
    slotClaimed = true;
    claimedGigId = gig._id;

    let booking;
    if (existing) {
      existing.status = 'booked';
      existing.reminder30MinSent = false;
      existing.reminder15MinSent = false;
      existing.cancelledAt = null;
      existing.checkInTime = null;
      existing.checkOutTime = null;
      existing.earnings = 0;
      booking = await existing.save();
    } else {
      booking = await GigBooking.create({
        gigId: gig._id,
        deliveryPartnerId: partnerObjectId,
        zoneName: gig.zoneName,
        status: 'booked',
      });
    }
    slotClaimed = false; // slot is now owned by the booking

    // No separate check-in step: if the shift is already open (starts within 30 min or is running),
    // check the rider in and put them online right away.
    let autoCheckedIn = false;
    if (window && !bookingPartner?.adminForceOffline) {
      const nowMs = Date.now();
      if (nowMs >= window.start.getTime() - CHECK_IN_EARLY_MINUTES * 60 * 1000 && nowMs < window.end.getTime()) {
        booking.status = 'checked_in';
        booking.checkInTime = new Date();
        await booking.save();
        await FoodDeliveryPartner.updateOne({ _id: partnerObjectId }, { $set: { availabilityStatus: 'online' } });
        autoCheckedIn = true;
      }
    }

    // Instantly check for 30-min reminder if shift starts soon
    setTimeout(checkAndSendGigReminders, 1000);

    return res.json({
      success: true,
      message: autoCheckedIn ? 'Gig booked - you are now online' : 'Gig shift booked successfully',
      data: { booking, autoCheckedIn },
    });
  } catch (error) {
    if (slotClaimed && claimedGigId) {
      await Gig.updateOne({ _id: claimedGigId, bookedCount: { $gt: 0 } }, { $inc: { bookedCount: -1 } }).catch(() => {});
    }
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'You have already booked this Gig shift' });
    }
    console.error('[Gig] bookGig error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to book gig' });
  }
}

/**
 * Cancel a booked Gig (only until the cancellation cutoff before shift start)
 */
export async function cancelGigBookingController(req, res) {
  try {
    const deliveryPartnerId = getDeliveryPartnerId(req);
    const { bookingId, gigId } = req.body;

    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
      return res.status(401).json({ success: false, message: 'Invalid or missing delivery partner session' });
    }
    const partnerObjectId = new mongoose.Types.ObjectId(deliveryPartnerId);

    const filter = { deliveryPartnerId: partnerObjectId, status: 'booked' };
    if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) filter._id = bookingId;
    else if (gigId && mongoose.Types.ObjectId.isValid(gigId)) filter.gigId = gigId;
    else return res.status(400).json({ success: false, message: 'Booking ID or Gig ID is required' });

    const booking = await GigBooking.findOne(filter);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'No active booking found for this gig' });
    }

    const gig = await Gig.findById(booking.gigId).lean();
    const window = getShiftWindow(gig);
    const cutoffMins = gig?.cancellationCutoffMinutes ?? 60;
    if (window && Date.now() > window.start.getTime() - cutoffMins * 60 * 1000) {
      return res.status(400).json({
        success: false,
        message: `Cancellation is not allowed within ${cutoffMins} minutes before the shift starts`,
      });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    await booking.save();
    await Gig.updateOne({ _id: booking.gigId, bookedCount: { $gt: 0 } }, { $inc: { bookedCount: -1 } });

    return res.json({ success: true, message: 'Gig booking cancelled successfully' });
  } catch (error) {
    console.error('[Gig] cancelGigBooking error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to cancel booking' });
  }
}

/**
 * Check-in for a booked Gig
 */
export async function checkInGigController(req, res) {
  try {
    const deliveryPartnerId = getDeliveryPartnerId(req);
    const { bookingId, gigId } = req.body;

    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
      return res.status(401).json({ success: false, message: 'Invalid or missing delivery partner session' });
    }

    const partnerObjectId = new mongoose.Types.ObjectId(deliveryPartnerId);

    let booking;
    if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) {
      booking = await GigBooking.findOne({ _id: bookingId, deliveryPartnerId: partnerObjectId });
    } else if (gigId && mongoose.Types.ObjectId.isValid(gigId)) {
      booking = await GigBooking.findOne({
        gigId,
        deliveryPartnerId: partnerObjectId,
        status: { $in: ['booked', 'checked_in'] },
      });
    }

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Active gig booking not found' });
    }

    if (!['booked', 'checked_in'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot check in: booking is ${booking.status}` });
    }

    const partner = await FoodDeliveryPartner.findById(partnerObjectId).select('adminForceOffline').lean();
    if (partner?.adminForceOffline) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been set offline by admin. Please contact support.',
      });
    }

    if (booking.status === 'booked') {
      const gig = await Gig.findById(booking.gigId).lean();
      const window = getShiftWindow(gig);
      if (window) {
        const now = Date.now();
        if (now < window.start.getTime() - CHECK_IN_EARLY_MINUTES * 60 * 1000) {
          return res.status(400).json({
            success: false,
            message: `Check-in opens ${CHECK_IN_EARLY_MINUTES} minutes before the shift starts (${gig.startTime})`,
          });
        }
        if (now >= window.end.getTime()) {
          return res.status(400).json({ success: false, message: 'This Gig shift has already ended' });
        }
      }
      booking.status = 'checked_in';
      booking.checkInTime = new Date();
      await booking.save();
    }

    // Rider explicitly checked in -> go online.
    await FoodDeliveryPartner.updateOne({ _id: partnerObjectId }, { $set: { availabilityStatus: 'online' } });

    return res.json({
      success: true,
      message: 'Checked-in to Gig shift successfully',
      data: { booking },
    });
  } catch (error) {
    console.error('[Gig] checkInGig error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to check-in gig' });
  }
}

/**
 * Check-out of a Gig
 */
export async function checkOutGigController(req, res) {
  try {
    const deliveryPartnerId = getDeliveryPartnerId(req);
    const { bookingId } = req.body;

    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
      return res.status(401).json({ success: false, message: 'Invalid or missing delivery partner session' });
    }
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: 'Valid booking ID is required' });
    }

    const partnerObjectId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const booking = await GigBooking.findOne({ _id: bookingId, deliveryPartnerId: partnerObjectId });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Gig booking not found' });
    }
    if (booking.status !== 'checked_in') {
      return res.status(400).json({
        success: false,
        message: booking.status === 'completed' ? 'Gig shift is already completed' : 'Check in to the Gig shift before checking out',
      });
    }
    if (await partnerHasActiveOrder(partnerObjectId)) {
      return res.status(400).json({
        success: false,
        message: 'Please finish your active delivery before ending the shift',
      });
    }

    const gig = await Gig.findById(booking.gigId);

    booking.status = 'completed';
    booking.checkOutTime = new Date();
    booking.earnings = (gig?.basePay || 0) + (gig?.incentiveBonus || 0);
    await booking.save();

    return res.json({
      success: true,
      message: 'Completed Gig shift successfully',
      data: { booking },
    });
  } catch (error) {
    console.error('[Gig] checkOutGig error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to check-out gig' });
  }
}

/**
 * Rider app reports that its GPS is off / permission denied -> push them a reminder.
 */
export async function reportGpsOffController(req, res) {
  try {
    return res.json({ success: true, data: { sent: false } });
  } catch (error) {
    console.error('[Gig] reportGpsOff error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to report GPS off' });
  }
}

/**
 * Get driver's booked & active Gigs
 */
export async function getMyGigsController(req, res) {
  try {
    const deliveryPartnerId = getDeliveryPartnerId(req);

    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
      return res.json({ success: true, data: { bookings: [] } });
    }

    const partnerObjectId = new mongoose.Types.ObjectId(deliveryPartnerId);

    const bookings = await GigBooking.find({ deliveryPartnerId: partnerObjectId })
      .populate('gigId')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: { bookings },
    });
  } catch (error) {
    console.error('[Gig] getMyGigs error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to get my gigs' });
  }
}

/**
 * Get Drivers List Zone-wise ("list ke form me") with 100% Dynamic DB Data
 */
export async function getZoneDriversListController(req, res) {
  try {
    const { zoneName } = req.query;

    const filter = {};
    if (zoneName && zoneName !== 'ALL ZONES' && zoneName !== 'All Areas / Zones') {
      filter.$or = [{ zoneName }, { city: zoneName }];
    }

    const partners = await FoodDeliveryPartner.find(filter)
      .select('name phone profilePhoto availabilityStatus lastLat lastLng lastLocationAt vehicleType vehicleNumber city rating zoneName createdAt')
      .sort({ availabilityStatus: -1, updatedAt: -1 })
      .lean();

    const activeBookings = await GigBooking.find({
      status: { $in: ['booked', 'checked_in'] },
    })
      .populate('gigId')
      .lean();

    // NOTE: this is a read-only listing. Do not write availabilityStatus here: the
    // display below already derives ONLINE strictly from (booked gig && online), and a
    // GET that flips every unbooked rider offline made riders drop offline whenever
    // anyone opened this list.

    const bookingMap = new Map();
    activeBookings.forEach((b) => {
      bookingMap.set(String(b.deliveryPartnerId), b);
    });

    let onlineCount = 0;
    let inShiftCount = 0;
    let bookedOfflineCount = 0;
    let offlineCount = 0;

    const driversList = partners.map((p) => {
      const activeBooking = bookingMap.get(String(p._id));
      const hasBookedGig = Boolean(activeBooking);
      const rawIsOnline = p.availabilityStatus === 'online';

      // STRICT RULE: Driver CAN ONLY BE ONLINE IF THEY HAVE AN ACTIVE BOOKED GIG SHIFT!
      const isOnline = hasBookedGig && rawIsOnline;
      const isInShift = Boolean(activeBooking && activeBooking.status === 'checked_in');

      let statusDisplay = 'OFFLINE';
      let statusColor = 'gray';

      if (isInShift) {
        statusDisplay = 'IN SHIFT';
        statusColor = 'blue';
        inShiftCount++;
      } else if (isOnline) {
        statusDisplay = 'ONLINE';
        statusColor = 'green';
        onlineCount++;
      } else if (hasBookedGig) {
        statusDisplay = 'BOOKED (OFFLINE)';
        statusColor = 'amber';
        bookedOfflineCount++;
      } else {
        statusDisplay = 'OFFLINE';
        statusColor = 'gray';
        offlineCount++;
      }

      return {
        id: p._id,
        name: p.name || 'Delivery Partner',
        phone: p.phone,
        profilePhoto: p.profilePhoto || null,
        vehicleType: p.vehicleType || 'Bike',
        vehicleNumber: p.vehicleNumber || 'MP-09',
        rating: p.rating > 0 ? p.rating : null,
        availabilityStatus: isOnline ? 'online' : 'offline',
        zoneName: p.zoneName || p.city || 'Indore Central',
        statusDisplay,
        statusColor,
        isOnline,
        isInShift,
        hasBookedGig,
        bookedTimeText: activeBooking?.createdAt ? new Date(activeBooking.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null,
        activeShift: activeBooking?.gigId
          ? {
              title: activeBooking.gigId.title,
              startTime: activeBooking.gigId.startTime,
              endTime: activeBooking.gigId.endTime,
              status: activeBooking.status,
            }
          : null,
        lastLocationAt: p.lastLocationAt || null,
      };
    });

    return res.json({
      success: true,
      data: {
        zoneName: zoneName || 'ALL ZONES',
        totalDrivers: driversList.length,
        summary: {
          total: driversList.length,
          onlineCount,
          inShiftCount,
          bookedOfflineCount,
          offlineCount,
        },
        drivers: driversList,
      },
    });
  } catch (error) {
    console.error('[Gig] getZoneDriversList error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to get zone drivers list' });
  }
}

// =========================================
// ADMIN CONTROLLERS FOR GIG MANAGEMENT
// =========================================

/**
 * Admin: Create a new Gig for a Zone
 */
export async function adminCreateGigController(req, res) {
  try {
    const {
      zoneName = 'Indore Central',
      title,
      shiftType = 'MORNING',
      startTime,
      endTime,
      date = getTodayDateString(),
      basePay = 300,
      incentiveBonus = 50,
      maxDrivers = 15,
      cancellationCutoffMinutes = 60,
      isActive = true,
    } = req.body;

    if (!title || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Title, startTime, and endTime are required to create a Gig',
      });
    }

    const finalZone = zoneName || 'ALL ZONES';

    const gig = await Gig.create({
      zoneName: finalZone,
      title: title.trim(),
      shiftType: shiftType || 'MORNING',
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      date: date || getTodayDateString(),
      basePay: Number(basePay) || 300,
      incentiveBonus: Number(incentiveBonus) || 50,
      maxDrivers: Number(maxDrivers) || 15,
      cancellationCutoffMinutes: Math.max(0, Number(cancellationCutoffMinutes) || 0),
      bookedCount: 0,
      isActive: isActive !== false,
    });

    console.log('[AdminGig] Created gig:', gig._id, gig.title, gig.zoneName, gig.date);

    return res.status(201).json({
      success: true,
      message: 'Gig created successfully by Admin',
      data: { gig },
    });
  } catch (error) {
    console.error('[AdminGig] create error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to create gig' });
  }
}

/**
 * Admin: List all Gigs
 */
export async function adminListGigsController(req, res) {
  try {
    const { zoneName, date, isActive } = req.query;
    const filter = {};
    if (zoneName && zoneName !== 'ALL ZONES' && zoneName !== 'ALL') {
      const escapedZone = zoneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.zoneName = new RegExp(`^${escapedZone}$`, 'i');
    }
    if (date && date !== 'ALL DATES' && date !== 'ALL' && date !== '') filter.date = date;
    if (isActive !== undefined && isActive !== 'all' && isActive !== '') filter.isActive = isActive === 'true';

    const gigs = await Gig.find(filter).sort({ date: -1, startTime: 1 }).lean();

    return res.json({
      success: true,
      data: { gigs },
    });
  } catch (error) {
    console.error('[AdminGig] list error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to list admin gigs' });
  }
}

/**
 * Admin: Update a Gig
 */
export async function adminUpdateGigController(req, res) {
  try {
    const { id } = req.params;
    // Whitelist editable fields; bookedCount is owned by the booking flow.
    const allowed = ['zoneName', 'title', 'shiftType', 'startTime', 'endTime', 'date', 'basePay', 'incentiveBonus', 'maxDrivers', 'cancellationCutoffMinutes', 'isActive'];
    const updateData = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))
    );

    const gig = await Gig.findByIdAndUpdate(id, { $set: updateData }, { new: true });
    if (!gig) {
      return res.status(404).json({ success: false, message: 'Gig not found' });
    }

    return res.json({
      success: true,
      message: 'Gig updated successfully',
      data: { gig },
    });
  } catch (error) {
    console.error('[AdminGig] update error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to update gig' });
  }
}

/**
 * Admin: Delete a Gig
 */
export async function adminDeleteGigController(req, res) {
  try {
    const { id } = req.params;
    const gig = await Gig.findByIdAndDelete(id);

    if (!gig) {
      return res.status(404).json({ success: false, message: 'Gig not found' });
    }

    await GigBooking.deleteMany({ gigId: id });

    return res.json({
      success: true,
      message: 'Gig deleted successfully',
    });
  } catch (error) {
    console.error('[AdminGig] delete error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to delete gig' });
  }
}

// =========================================
// HANDOVER REQUEST CONTROLLERS
// =========================================

/**
 * Driver: Submit Emergency Handover Request
 */
export async function createHandoverRequestController(req, res) {
  try {
    const deliveryPartnerId = getDeliveryPartnerId(req);
    const { orderId, reason = 'Emergency / Vehicle Breakdown' } = req.body;

    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
      return res.status(401).json({ success: false, message: 'Driver authorization required' });
    }

    const partnerObjectId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const partner = await FoodDeliveryPartner.findById(partnerObjectId).lean();

    const handover = await HandoverRequest.create({
      deliveryPartnerId: partnerObjectId,
      orderId: orderId && mongoose.Types.ObjectId.isValid(orderId) ? new mongoose.Types.ObjectId(orderId) : null,
      reason,
      status: 'approved',
    });

    // 1. Force requesting driver offline automatically
    await FoodDeliveryPartner.findByIdAndUpdate(partnerObjectId, { availabilityStatus: 'offline' });

    // 2. Clear driver's active gig booking status if checked_in
    await GigBooking.updateMany(
      { deliveryPartnerId: partnerObjectId, status: 'checked_in' },
      { $set: { status: 'completed', checkOutTime: new Date() } }
    );

    // 3. Unassign the order & immediately broadcast to other online drivers!
    if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
      const orderMongoId = new mongoose.Types.ObjectId(orderId);
      const existingOrder = await FoodOrder.findById(orderMongoId);

      if (existingOrder) {
        const nextStatus = ['picked_up', 'delivering', 'reached_drop'].includes(existingOrder.orderStatus)
          ? 'ready_for_pickup'
          : existingOrder.orderStatus;

        await FoodOrder.findByIdAndUpdate(orderMongoId, {
          $set: {
            'dispatch.deliveryPartnerId': null,
            'dispatch.status': 'unassigned',
            orderStatus: nextStatus,
          },
          $unset: { "dispatch.dispatchingAt": "" }
        });

        // Broadcast order request to other available drivers immediately!
        void tryAutoAssign(orderMongoId.toString(), { attempt: 3 }).catch(err => {
          console.error('[Handover] Auto-reassign error:', err?.message || err);
        });
      }
    }

    // 4. Emit socket event to the current driver room to clear active state & force offline UI
    const io = getIO();
    if (io) {
      const roomName = rooms.delivery(partnerObjectId);
      io.to(roomName).emit('admin_status_update', { status: 'offline' });
      io.to(roomName).emit('handover_processed', { orderId, isOffline: true });
    }

    // 5. Notify admins via FCM
    void notifyAdminsSafely({
      title: '🚨 Emergency Handover Request Processed',
      body: `Delivery Partner ${partner?.name || 'Partner'} requested handover. Order reassigned & partner set offline.`,
      data: {
        type: 'handover_request',
        id: String(handover._id),
        driverName: partner?.name || '',
        link: '/admin/food/delivery-partners/gigs',
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Emergency handover submitted. Order reassigned to available drivers.',
      data: { handover },
    });
  } catch (error) {
    console.error('[Handover] create error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to submit handover request' });
  }
}

/**
 * Admin: Get Pending Handover Requests
 */
export async function adminGetHandoverRequestsController(req, res) {
  try {
    const requests = await HandoverRequest.find({ status: 'pending' })
      .populate('deliveryPartnerId', 'name phone profilePhoto zoneName city')
      .populate('orderId', 'orderId restaurantName customerLocation')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: { requests },
    });
  } catch (error) {
    console.error('[Handover] adminGet error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to fetch handover requests' });
  }
}

/**
 * Admin: Approve Handover Request (Sets Driver Offline & Reassigns Order)
 */
export async function adminApproveHandoverRequestController(req, res) {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const handover = await HandoverRequest.findById(id);
    if (!handover) {
      return res.status(404).json({ success: false, message: 'Handover request not found' });
    }

    handover.status = 'approved';
    if (adminNotes) handover.adminNotes = adminNotes;
    await handover.save();

    const driverId = handover.deliveryPartnerId;

    // 1. Force driver offline automatically!
    await FoodDeliveryPartner.findByIdAndUpdate(driverId, { availabilityStatus: 'offline' });

    // 2. Clear driver's active gig booking status if any
    await GigBooking.updateMany(
      { deliveryPartnerId: driverId, status: 'checked_in' },
      { $set: { status: 'completed', checkOutTime: new Date() } }
    );

    // 3. If order attached, unassign driver & reset order to ready_for_pickup for reassignment!
    if (handover.orderId) {
      await FoodOrder.findByIdAndUpdate(handover.orderId, {
        $set: {
          'dispatch.deliveryPartnerId': null,
          'dispatch.status': 'unassigned',
          orderStatus: 'ready_for_pickup',
        },
      });
    }

    // 4. Notify Driver
    void notifyOwnerSafely(
      { ownerType: 'DELIVERY', ownerId: String(driverId) },
      {
        title: '✅ Handover Approved',
        body: 'Your emergency handover request has been approved by Admin. You have been set offline.',
        data: { type: 'HANDOVER_APPROVED' },
      }
    );

    return res.json({
      success: true,
      message: 'Emergency handover approved. Driver set offline and task unassigned for reassignment.',
      data: { handover },
    });
  } catch (error) {
    console.error('[Handover] approve error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to approve handover request' });
  }
}

/**
 * Admin: Reject Handover Request
 */
export async function adminRejectHandoverRequestController(req, res) {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const handover = await HandoverRequest.findById(id);
    if (!handover) {
      return res.status(404).json({ success: false, message: 'Handover request not found' });
    }

    handover.status = 'rejected';
    if (adminNotes) handover.adminNotes = adminNotes;
    await handover.save();

    const driverId = handover.deliveryPartnerId;

    // Notify Driver
    void notifyOwnerSafely(
      { ownerType: 'DELIVERY', ownerId: String(driverId) },
      {
        title: '❌ Handover Request Rejected',
        body: 'Your emergency handover request was rejected by Admin. Please contact support.',
        data: { type: 'HANDOVER_REJECTED' },
      }
    );

    return res.json({
      success: true,
      message: 'Handover request rejected',
      data: { handover },
    });
  } catch (error) {
    console.error('[Handover] reject error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to reject handover request' });
  }
}
