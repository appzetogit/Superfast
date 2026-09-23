import mongoose from 'mongoose';
import { Gig } from '../models/gig.model.js';
import { GigBooking } from '../models/gigBooking.model.js';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { HandoverRequest } from '../models/handoverRequest.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { notifyOwnerSafely, notifyAdminsSafely } from '../../../../core/notifications/firebase.service.js';
import { tryAutoAssign } from '../../orders/services/order-dispatch.service.js';
import { getIO, rooms } from '../../../../config/socket.js';

/** Helper: Get delivery partner ID safely from req.user */
function getDeliveryPartnerId(req) {
  const id = req.user?.userId || req.user?.id || req.user?._id || req.user?.deliveryPartnerId;
  return id ? String(id) : null;
}

/** Helper: Get today YYYY-MM-DD */
function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 30-Minute Pre-Shift Notification Scheduler
 */
export async function checkAndSendGigReminders() {
  try {
    const activeBookings = await GigBooking.find({
      status: 'booked',
      reminderSent: { $ne: true },
    }).populate('gigId').lean();

    const now = Date.now();

    for (const booking of activeBookings) {
      const gig = booking.gigId;
      if (!gig || !gig.startTime || !gig.date) continue;

      const timeParts = String(gig.startTime).split(':').map(Number);
      const hours = timeParts[0] || 0;
      const minutes = timeParts[1] || 0;

      const shiftDate = new Date(gig.date);
      shiftDate.setHours(hours, minutes, 0, 0);

      const diffMs = shiftDate.getTime() - now;
      const diffMinutes = diffMs / (1000 * 60);

      // Trigger reminder if shift starts in <= 35 mins (or up to 15 mins past start)
      if (diffMinutes <= 35 && diffMinutes >= -15) {
        await GigBooking.updateOne({ _id: booking._id }, { $set: { reminderSent: true } });

        const minsLeftText = diffMinutes > 0 ? `${Math.max(1, Math.round(diffMinutes))} minutes` : 'now';

        await notifyOwnerSafely(
          { ownerType: 'DELIVERY', ownerId: String(booking.deliveryPartnerId) },
          {
            title: '⏰ Shift Starting Soon!',
            body: `Your booked Gig shift (${gig.startTime} - ${gig.endTime}) starts ${minsLeftText}! Please check-in now to start working.`,
            data: {
              type: 'GIG_REMINDER',
              gigId: String(gig._id),
              link: '/food/delivery',
            },
          }
        );
      }
    }
  } catch (error) {
    console.error('[Gig] Reminder check error:', error);
  }
}

// Start recurring 30-min pre-shift notification check every 2 minutes
setInterval(checkAndSendGigReminders, 2 * 60 * 1000);

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

    // Auto-detect zone from driver profile if not explicitly passed
    if (!zoneName && partner) {
      zoneName = partner.zoneName || partner.city || 'Indore Central';
    } else if (!zoneName) {
      zoneName = 'Indore Central';
    }

    // Fetch Admin-created active gigs for driver's zone OR 'ALL ZONES' for date (Case-insensitive)
    const query = { isActive: true };

    if (zoneName && zoneName !== 'ALL ZONES' && zoneName !== 'ALL' && zoneName !== 'All Areas / Zones') {
      const escapedZone = zoneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cleanZone = zoneName.replace(/\s*zone\s*/i, '').trim();
      const escapedCleanZone = cleanZone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      query.$or = [
        { zoneName: new RegExp(`^${escapedZone}$`, 'i') },
        { zoneName: new RegExp(`^${escapedCleanZone}`, 'i') },
        { zoneName: /^ALL ZONES$/i },
        { zoneName: /^General Zone$/i },
        { zoneName: '' },
        { zoneName: null },
        { zoneName: { $exists: false } },
      ];
    }

    if (date && date !== 'ALL DATES' && date !== 'ALL' && date !== '') {
      query.date = date;
    }

    const gigs = await Gig.find(query)
      .sort({ startTime: 1 })
      .lean();

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
        driverZone: partner?.zoneName || partner?.city || zoneName,
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
  try {
    const deliveryPartnerId = getDeliveryPartnerId(req);
    const { gigId } = req.body;

    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
      return res.status(401).json({ success: false, message: 'Invalid or missing delivery partner session' });
    }

    if (!gigId) {
      return res.status(400).json({ success: false, message: 'Gig ID is required' });
    }

    const gig = await Gig.findById(gigId);
    if (!gig || !gig.isActive) {
      return res.status(404).json({ success: false, message: 'Gig shift not found or inactive' });
    }

    if (gig.bookedCount >= gig.maxDrivers) {
      return res.status(400).json({ success: false, message: 'No slots available for this Gig shift' });
    }

    const partnerObjectId = new mongoose.Types.ObjectId(deliveryPartnerId);

    // Check existing booking regardless of status to handle re-booking cleanly
    const existing = await GigBooking.findOne({
      gigId: gig._id,
      deliveryPartnerId: partnerObjectId,
    });

    if (existing) {
      if (existing.status !== 'cancelled') {
        return res.status(400).json({ success: false, message: 'You have already booked this Gig shift' });
      }
      existing.status = 'booked';
      existing.reminderSent = false;
      existing.checkInTime = null;
      existing.checkOutTime = null;
      await existing.save();

      gig.bookedCount = (gig.bookedCount || 0) + 1;
      await gig.save();

      setTimeout(checkAndSendGigReminders, 1000);

      return res.json({
        success: true,
        message: 'Gig shift booked successfully',
        data: { booking: existing },
      });
    }

    const booking = await GigBooking.create({
      gigId: gig._id,
      deliveryPartnerId: partnerObjectId,
      zoneName: gig.zoneName,
      status: 'booked',
    });

    gig.bookedCount = (gig.bookedCount || 0) + 1;
    await gig.save();

    // Instantly check for 30-min reminder if shift starts soon
    setTimeout(checkAndSendGigReminders, 1000);

    return res.json({
      success: true,
      message: 'Gig shift booked successfully',
      data: { booking },
    });
  } catch (error) {
    console.error('[Gig] bookGig error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to book gig' });
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
    if (bookingId) {
      booking = await GigBooking.findOne({ _id: bookingId, deliveryPartnerId: partnerObjectId });
    } else if (gigId) {
      booking = await GigBooking.findOne({ gigId, deliveryPartnerId: partnerObjectId, status: 'booked' });
    }

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Active gig booking not found' });
    }

    booking.status = 'checked_in';
    booking.checkInTime = new Date();
    await booking.save();

    // Set delivery partner availability status to online
    await FoodDeliveryPartner.findOneAndUpdate(
      { _id: partnerObjectId },
      { availabilityStatus: 'online' }
    );

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

    const partnerObjectId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const booking = await GigBooking.findOne({ _id: bookingId, deliveryPartnerId: partnerObjectId });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Gig booking not found' });
    }

    const gig = await Gig.findById(booking.gigId);

    booking.status = 'completed';
    booking.checkOutTime = new Date();
    booking.earnings = (gig?.basePay || 300) + (gig?.incentiveBonus || 50);
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

    // Auto sync stale DB availabilityStatus to offline for partners without active gig booking
    const bookedPartnerIds = activeBookings.map((b) => String(b.deliveryPartnerId));
    if (bookedPartnerIds.length > 0) {
      await FoodDeliveryPartner.updateMany(
        {
          _id: { $nin: bookedPartnerIds.map((id) => new mongoose.Types.ObjectId(id)) },
          availabilityStatus: 'online',
        },
        { $set: { availabilityStatus: 'offline' } }
      );
    } else {
      await FoodDeliveryPartner.updateMany(
        { availabilityStatus: 'online' },
        { $set: { availabilityStatus: 'offline' } }
      );
    }

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
        rating: p.rating || 4.8,
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
      isActive = true,
    } = req.body;

    if (!title || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Title, startTime, and endTime are required to create a Gig',
      });
    }

    const finalZone = (!zoneName || zoneName === 'ALL ZONES') ? 'Indore Central' : zoneName;

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
    const updateData = req.body;

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
