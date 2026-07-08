
import mongoose from 'mongoose';
import { getIO, rooms } from '../../../config/socket.js';
import { logger } from '../../../utils/logger.js';
import { QuickOrder } from '../models/order.model.js';
import { QuickCart } from '../models/cart.model.js';
import { QuickProduct } from '../models/product.model.js';
import { Seller } from '../seller/models/seller.model.js';
import { SellerOrder } from '../seller/models/sellerOrder.model.js';
import { QuickZone } from '../models/quick_zone.model.js';
import { FoodZone } from '../../food/admin/models/zone.model.js';
import { QuickReturnRequest } from '../models/ReturnRequest.model.js';
import { getSellerCommissionSnapshot } from '../admin/services/commission.service.js';
import {
  calculateQuickPricing,
  getRiderEarning as getQuickRiderEarning,
} from '../admin/services/billing.service.js';
import { haversineKm } from '../../food/orders/services/order.helpers.js';
import * as foodTransactionService from '../../food/orders/services/foodTransaction.service.js';
import { emitQuickCommerceStatusUpdate } from '../services/quickStatusRealtime.service.js';
import { notifyOwnerSafely } from '../../../core/notifications/firebase.service.js';
import {
  createRazorpayOrder,
  getRazorpayKeyId,
  isRazorpayConfigured,
  verifyPaymentSignature,
  fetchRazorpayPayment
} from '../../food/orders/helpers/razorpay.helper.js';

const approvedProductFilter = {
  $or: [
    { isActive: true },
    { isActive: { $exists: false } },
    { status: 'active' },
  ],
  $and: [
    {
      $or: [
        { approvalStatus: { $exists: false } },
        { approvalStatus: 'approved' },
      ],
    },
  ],
};

const resolveId = (req) => {
  if (req.user?.userId) return { userId: req.user.userId };
  const sessionId = String(req.headers['x-quick-session'] || req.body.sessionId || req.query.sessionId || '').trim();
  return sessionId ? { sessionId } : null;
};

const getOrderPayableAmount = (order) => {
  const pricing = order?.pricing || {};
  const pricingTotal = Number(pricing.total ?? order?.total ?? 0);

  // In quick-commerce, `pricing.total` already includes all fees including platform fee.
  return Number.isFinite(pricingTotal) ? Math.max(0, pricingTotal) : 0;
};

const normalizeOrderSummary = (order, returnedOrderIdsSet = new Set()) => {
  const amount = getOrderPayableAmount(order);
  const paymentMethod = order?.payment?.method || order?.paymentMethod || 'cash';
  const paymentStatus = order?.payment?.status || order?.paymentStatus || '';

  return {
    id: order._id,
    _id: order._id,
    orderId: order.orderId,
    orderNumber: order.orderId,
    total: amount,
    totalAmount: amount,
    payableAmount: amount,
    amount,
    status: order.orderStatus,
    orderStatus: order.orderStatus,
    workflowStatus: order.workflowStatus || '',
    returnStatus: order.returnStatus || (returnedOrderIdsSet.has(String(order._id)) ? 'RETURN_REQUESTED' : ''),
    paymentMethod,
    paymentStatus,
    payment: order.payment || {},
    itemCount: Array.isArray(order.items)
      ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      : 0,
    createdAt: order.createdAt,
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          itemId: item.itemId || item.productId || '',
          name: item.name,
          image: item.image,
          price: item.price,
          quantity: item.quantity,
        }))
      : [],
    pricing: order.pricing || {},
  };
};

const normalizeDeliveryAddress = (address) => {
  if (!address || typeof address !== 'object') return null;

  const street = String(address.address || address.street || '').trim();
  const city = String(address.city || '').trim();
  const additionalDetails = String(address.landmark || address.additionalDetails || '').trim();
  const phone = String(address.phone || '').trim();
  const label = ['Home', 'Office', 'Other'].includes(address.type) ? address.type : 'Other';
  const lat = Number(address.location?.lat);
  const lng = Number(address.location?.lng);

  return {
    label,
    street,
    additionalDetails,
    city: city || 'NA',
    state: 'NA',
    zipCode: '',
    phone,
    ...(Number.isFinite(lat) && Number.isFinite(lng)
      ? {
          location: {
            type: 'Point',
            coordinates: [lng, lat],
          },
        }
      : {}),
  };
};

const normalizeRequestedItems = (items) => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const rawId = String(item?.productId || item?.itemId || item?.id || item?._id || '').trim();
      const [parentId, variantSku] = rawId.split("::");
      return {
        productId: parentId,
        variantSku: variantSku || item?.variantSku || null,
        quantity: Math.max(1, Number(item?.quantity || 1)),
      };
    })
    .filter((item) => item.productId && mongoose.isValidObjectId(item.productId));
};

const emitQuickOrderStatusUpdate = (order, message = '') => {
  try {
    void emitQuickCommerceStatusUpdate(order, { message });
  } catch {
    // best-effort realtime update
  }
};

const emitQuickSellerOrders = (sellerOrders) => {
  try {
    const io = getIO();
    if (!io || !Array.isArray(sellerOrders) || sellerOrders.length === 0) return;

    sellerOrders.forEach((sellerOrder) => {
      if (!sellerOrder?.sellerId) return;
      const payload = {
        orderId: sellerOrder.orderId,
        sellerOrderId: sellerOrder._id?.toString?.() || '',
        status: sellerOrder.status,
        workflowStatus: sellerOrder.workflowStatus,
        items: sellerOrder.items || [],
        pricing: sellerOrder.pricing || {},
        createdAt: sellerOrder.createdAt || new Date(),
      };

      io.to(rooms.seller(sellerOrder.sellerId)).emit('new_order', payload);
      io.to(rooms.seller(sellerOrder.sellerId)).emit('order:new', payload);

      // Send push notification to seller
      void notifyOwnerSafely(
        { ownerType: 'SELLER', ownerId: sellerOrder.sellerId },
        {
          title: 'New order received',
          body: `Order #${sellerOrder.orderId} is waiting for review.`,
          sound: true,
          data: {
            type: 'new_order',
            orderId: sellerOrder.orderId,
            orderMongoId: sellerOrder.parentOrderId?.toString() || sellerOrder._id?.toString() || '',
            link: `/seller/orders/${sellerOrder._id?.toString() || ''}`
          }
        }
      );
    });
  } catch {
    // best-effort realtime update
  }
};

const isPointInPolygon = (lat, lng, polygon) => {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

export const placeOrder = async (req, res) => {
  try {
    const idQuery = resolveId(req);

    if (!idQuery) {
      return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
    }

    const cart = await QuickCart.findOne(idQuery).lean();
    const requestedItems = normalizeRequestedItems(req.body?.items);
    const sourceItems =
      Array.isArray(cart?.items) && cart.items.length > 0 ? cart.items : requestedItems;

    if (sourceItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const productIds = sourceItems.map((item) => item.productId);
    const products = await QuickProduct.find({ _id: { $in: productIds }, ...approvedProductFilter }).lean();
    const productMap = products.reduce((acc, product) => {
      acc[String(product._id)] = product;
      return acc;
    }, {});

    let items = sourceItems
      .map((item) => {
        const product = productMap[String(item.productId)];
        if (!product) return null;
        
        const variant = item.variantSku && Array.isArray(product.variants)
          ? product.variants.find((v) => v.sku === item.variantSku)
          : null;
          
        const unitPrice = variant
          ? (Number(variant.salePrice || 0) > 0 ? Number(variant.salePrice) : Number(variant.price || 0))
          : (Number(product.salePrice || 0) > 0 ? Number(product.salePrice) : Number(product.price || 0));
          
        const name = variant ? `${product.name} (${variant.name})` : product.name;

        return {
          productId: product._id,
          variantSku: item.variantSku || null,
          sellerId: product.sellerId || null,
          name: name,
          image: product.image || product.mainImage || '',
          price: unitPrice,
          quantity: item.quantity,
        };
      })
      .filter(Boolean);

    if (items.length === 0 && requestedItems.length > 0 && sourceItems !== requestedItems) {
      const fallbackProductIds = requestedItems.map((item) => item.productId);
      const fallbackProducts = await QuickProduct.find({
        _id: { $in: fallbackProductIds },
        ...approvedProductFilter,
      }).lean();
      const fallbackProductMap = fallbackProducts.reduce((acc, product) => {
        acc[String(product._id)] = product;
        return acc;
      }, {});

      items = requestedItems
        .map((item) => {
          const product = fallbackProductMap[String(item.productId)];
          if (!product) return null;
          
          const variant = item.variantSku && Array.isArray(product.variants)
            ? product.variants.find((v) => v.sku === item.variantSku)
            : null;
            
          const unitPrice = variant
            ? (Number(variant.salePrice || 0) > 0 ? Number(variant.salePrice) : Number(variant.price || 0))
            : (Number(product.salePrice || 0) > 0 ? Number(product.salePrice) : Number(product.price || 0));
            
          const name = variant ? `${product.name} (${variant.name})` : product.name;

          return {
            productId: product._id,
            variantSku: item.variantSku || null,
            sellerId: product.sellerId || null,
            name: name,
            image: product.image || product.mainImage || '',
            price: unitPrice,
            quantity: item.quantity,
          };
        })
        .filter(Boolean);
    }

    if (items.length === 0) {
      logger.warn(`Quick placeOrder: No valid items found for productIds: ${JSON.stringify(productIds)} using idQuery: ${JSON.stringify(idQuery)}`);
      return res.status(400).json({ success: false, message: 'No valid items found in cart' });
    }

    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discount = Math.max(0, Number(req.body?.discountTotal || 0));
    const { pricing } = await calculateQuickPricing({
      subtotal,
      discount,
      products,
    });
    const deliveryFee = Number(pricing.deliveryFee || 0);
    const total = Number(pricing.total || 0);
    const orderNumber = `QC${Date.now().toString().slice(-8)}`;
    const isOnlinePayment = String(req.body?.paymentMode || 'COD').toUpperCase() === 'ONLINE';
    const paymentMode = isOnlinePayment ? 'razorpay' : 'cash';
    const sellerPaymentMode = isOnlinePayment ? 'online' : 'cash';
    // Seller must receive/track every order regardless of payment mode (COD/online).
    // Earnings are based on delivered SellerOrders, so we always create these legs.
    const shouldFanOutSellerOrders = true;
    const deliveryAddress = normalizeDeliveryAddress(req.body?.address);

    const sellerIds = [...new Set(products.map((p) => String(p.sellerId)).filter(id => id && id !== 'undefined' && mongoose.Types.ObjectId.isValid(id)))];
    const sellers = sellerIds.length > 0 ? await Seller.find({ _id: { $in: sellerIds } }).lean() : [];

    // Validate zone constraint
    const customerCoords = deliveryAddress?.location?.coordinates;
    if (customerCoords && customerCoords.length === 2) {
      const custLng = customerCoords[0];
      const custLat = customerCoords[1];

      for (const product of products) {
        const seller = sellers.find((s) => String(s._id) === String(product.sellerId));
        if (seller && seller.shopInfo?.zoneId) {
          let zone = null;
          if (seller.shopInfo.zoneSource === 'food') {
            zone = await FoodZone.findById(seller.shopInfo.zoneId).lean();
          } else {
            zone = await QuickZone.findById(seller.shopInfo.zoneId).lean();
          }

          if (zone && zone.coordinates && zone.coordinates.length >= 3) {
            const isInside = isPointInPolygon(custLat, custLng, zone.coordinates);
            if (!isInside) {
              return res.status(400).json({
                success: false,
                message: `Delivery address is outside of ${seller.shopName || 'seller'}'s service zone. Please choose a different address.`,
              });
            }
          }
        }
      }
    }

    const pickupPoints = sellers.map((seller) => {
      const sellerItems = items.filter((item) => String(item.sellerId) === String(seller._id));
      return {
        pickupType: 'quick',
        sourceId: String(seller._id),
        sourceName: seller.shopName || seller.name || 'Seller Store',
        address: seller.location?.address || seller.location?.formattedAddress || '',
        location: seller.location?.coordinates
          ? { type: 'Point', coordinates: seller.location.coordinates }
          : (Number.isFinite(seller.location?.latitude) && Number.isFinite(seller.location?.longitude)
              ? { type: 'Point', coordinates: [seller.location.longitude, seller.location.latitude] }
              : undefined),
        itemIds: sellerItems.map((item) => String(item.productId)),
      };
    });

    // Calculate actual distance between seller (first pickup) and customer
    let actualDistanceKm = 0.1;
    if (pickupPoints.length > 0 && customerCoords && customerCoords.length === 2) {
      const sellerCoords = pickupPoints[0].location?.coordinates; // [lng, lat]
      if (sellerCoords && sellerCoords.length === 2) {
        actualDistanceKm = haversineKm(
          sellerCoords[1], sellerCoords[0],
          customerCoords[1], customerCoords[0]
        );
      }
    }

    // Calculate rider earning
    const riderEarning = await getQuickRiderEarning(Math.max(0.1, actualDistanceKm));

    const order = await QuickOrder.create({
      orderType: 'quick',
      orderId: orderNumber,
      sessionId: idQuery.sessionId || '',
      userId: idQuery.userId || null,
      items: items.map((item) => ({
        itemId: String(item.productId),
        name: item.name,
        image: item.image,
        price: item.price,
        quantity: item.quantity,
        type: 'quick',
        sourceId: String(item.sellerId || item.productId),
        sourceName: '',
      })),
      pickupPoints,
      pricing: {
        ...pricing,
        subtotal,
        total,
      },
      deliveryAddress,
      timeSlot: req.body?.timeSlot || 'now',
      payment: {
        method: paymentMode,
        status: paymentMode === 'razorpay' ? 'created' : 'cod_pending',
        amountDue: Math.max(0, total),
      },
      orderStatus: 'placed',
      riderEarning: riderEarning || 0,
      platformProfit: Math.max(
        0,
        deliveryFee + Number(pricing.platformFee || 0) - (riderEarning || 0),
      ), // Initial guess, will be updated with commission
      statusHistory: [
        {
          byRole: 'SYSTEM',
          from: '',
          to: 'placed',
          note: 'Quick commerce order placed',
        },
      ],
    });

    const sellerBuckets = new Map();
    items.forEach((item) => {
      const sellerId = item.sellerId ? String(item.sellerId) : '';
      if (!sellerId) return;
      if (!sellerBuckets.has(sellerId)) sellerBuckets.set(sellerId, []);
      sellerBuckets.get(sellerId).push(item);
    });

    const sellerOrdersResults = sellerBuckets.size > 0
        ? await Promise.all(Array.from(sellerBuckets.entries()).map(async ([sellerId, sellerItems]) => {
            const sellerSubtotal = sellerItems.reduce(
              (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
              0,
            );
            const allocatedDeliveryFee = Number(
              ((deliveryFee * sellerSubtotal) / Math.max(subtotal, 1)).toFixed(2),
            );

            // Calculate commission for this specific seller
            const { commissionAmount } = await getSellerCommissionSnapshot(sellerId, sellerSubtotal);
            const sellerReceivable = Math.max(
              0,
              Number((sellerSubtotal - commissionAmount).toFixed(2)),
            );

            return {
              orderType: 'quick',
              parentOrderId: order._id,
              sellerId,
              orderId: order.orderId,
              customer: {
                name: String(req.body?.address?.name || 'Customer').trim() || 'Customer',
                phone: String(req.body?.address?.phone || '').trim(),
              },
              items: sellerItems.map((item) => ({
                productId: item.productId,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image,
              })),
              pricing: {
                subtotal: sellerSubtotal,
                commission: commissionAmount,
                total: sellerSubtotal + allocatedDeliveryFee,
                receivable: sellerReceivable,
              },
              status: paymentMode === 'razorpay' ? 'created' : 'pending',
              workflowStatus: paymentMode === 'razorpay' ? 'PENDING_PAYMENT' : 'SELLER_PENDING',
              sellerPendingExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
              address: {
                address: deliveryAddress?.street || '',
                city: deliveryAddress?.city || '',
                ...(Array.isArray(deliveryAddress?.location?.coordinates)
                  ? {
                      location: {
                        lat: deliveryAddress.location.coordinates[1],
                        lng: deliveryAddress.location.coordinates[0],
                      },
                    }
                  : {}),
              },
              payment: {
                method: sellerPaymentMode,
              },
            };
          }))
        : [];

    const totalSellerCommission = sellerOrdersResults.reduce((sum, so) => sum + (so.pricing?.commission || 0), 0);
    
    // Update the main order with the total commission
    if (totalSellerCommission > 0) {
      const platformProfit = Math.max(
        0,
        deliveryFee +
          Number(pricing.platformFee || 0) +
          totalSellerCommission -
          (riderEarning || 0),
      );
      await QuickOrder.updateOne(
        { _id: order._id },
        { 
          $set: { 
            'pricing.restaurantCommission': totalSellerCommission,
            platformProfit: platformProfit
          } 
        }
      );
      order.pricing.restaurantCommission = totalSellerCommission;
      order.platformProfit = platformProfit;
    }

    const sellerOrders = sellerOrdersResults;

    let razorpayPayload = null;
    if (paymentMode === "razorpay" && isRazorpayConfigured()) {
      try {
        const amountPaise = Math.round(getOrderPayableAmount(order) * 100);
        const rzOrder = await createRazorpayOrder(amountPaise, "INR", order.orderId);
        
        await QuickOrder.updateOne(
          { _id: order._id },
          {
            $set: {
              "payment.razorpay": {
                orderId: rzOrder.id,
                status: "created"
              }
            }
          }
        );
        order.payment.razorpay = { orderId: rzOrder.id, status: "created" };

        razorpayPayload = {
          key: getRazorpayKeyId(),
          amount: amountPaise,
          currency: "INR",
          orderId: rzOrder.id,
        };
      } catch (err) {
        logger.error(`Quick Razorpay order creation failed: ${err?.message || err}`);
      }
    }

    await QuickCart.findOneAndUpdate(idQuery, { $set: { items: [] } }, { upsert: false });

    if (paymentMode !== 'razorpay') {
      emitQuickOrderStatusUpdate(order, 'Quick order placed successfully.');
    }

    if (shouldFanOutSellerOrders) {
      void (async () => {
        try {
          if (!sellerOrders.length) return;
          // Idempotent upsert: protects against retries / duplicate placeOrder submissions.
          const upserts = await Promise.all(
            sellerOrders.map((doc) =>
              SellerOrder.findOneAndUpdate(
                { sellerId: doc.sellerId, orderId: doc.orderId },
                { $set: doc },
                { upsert: true, new: true, setDefaultsOnInsert: true },
              ),
            ),
          );
          if (paymentMode !== 'razorpay') {
            emitQuickSellerOrders(upserts.filter(Boolean));
          }
        } catch (error) {
          logger.error(`Quick seller order fanout failed for ${order.orderId}: ${error?.message || error}`);
        }
      })();
    }

    return res.status(201).json({
      success: true,
      result: {
        id: order._id,
        _id: order._id,
        orderId: order.orderId,
        orderNumber: order.orderId,
        total: getOrderPayableAmount(order),
        totalAmount: getOrderPayableAmount(order),
        payableAmount: getOrderPayableAmount(order),
        amount: getOrderPayableAmount(order),
        status: order.orderStatus,
        orderStatus: order.orderStatus,
        paymentMethod: order.payment?.method || paymentMode,
        paymentStatus: order.payment?.status || '',
        pricing: order.pricing || {},
        createdAt: order.createdAt,
      },
      razorpay: razorpayPayload
    });
  } catch (error) {
    logger.error(`Quick placeOrder failed: ${error?.message || error}`);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to place quick order',
    });
  }
};

export const getMyOrders = async (req, res) => {
  const idQuery = resolveId(req);

  if (!idQuery) {
    return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
  }

  const orders = await QuickOrder.find({ ...idQuery, orderType: 'quick' }).sort({ createdAt: -1 }).lean();

  const sellerIds = [
    ...new Set(
      orders
        .map((order) =>
          String(order?.items?.find((item) => item?.type === 'quick')?.sourceId || order?.items?.[0]?.sourceId || '').trim(),
        )
        .filter((value) => mongoose.Types.ObjectId.isValid(value)),
    ),
  ];

  const sellers = sellerIds.length
    ? await Seller.find({ _id: { $in: sellerIds } }).select('_id name shopName').lean()
    : [];
  const sellerMap = sellers.reduce((acc, seller) => {
    acc[String(seller._id)] = seller;
    return acc;
  }, {});

  const orderObjIds = orders.map(o => o._id);
  const returnedRequests = await QuickReturnRequest.find({ orderId: { $in: orderObjIds } }).select('orderId').lean();
  const returnedOrderIdsSet = new Set(returnedRequests.map(r => String(r.orderId)));

  const mappedOrders = orders.map((order) => {
    const normalized = normalizeOrderSummary(order, returnedOrderIdsSet);
    const sellerId = String(
      order?.items?.find((item) => item?.type === 'quick')?.sourceId || order?.items?.[0]?.sourceId || '',
    ).trim();
    const seller = sellerMap[sellerId] || null;

    return {
      ...normalized,
      sellerId: seller?._id || null,
      storeName: seller?.shopName || seller?.name || '',
      seller: seller
        ? {
            _id: seller._id,
            name: seller.name || '',
            shopName: seller.shopName || seller.name || 'Store',
          }
        : null,
    };
  });

  return res.json({
    success: true,
    result: mappedOrders,
    results: mappedOrders,
  });
};

export const getOrderById = async (req, res) => {
  try {
    const idQuery = resolveId(req);

    if (!idQuery) {
      return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
    }

    const rawOrderId = String(req.params.orderId || '').trim();
    if (!rawOrderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    const orderIdentityQuery = [{ orderId: rawOrderId }];
    if (mongoose.isValidObjectId(rawOrderId)) {
      orderIdentityQuery.unshift({ _id: rawOrderId });
    }

    const query = {
      ...idQuery,
      orderType: 'quick',
      $or: orderIdentityQuery,
    };

    const order = await QuickOrder.findOne(query).select('+deliveryOtp').lean();

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const sellerOrder = await SellerOrder.findOne({ orderId: order.orderId }).lean();
    const seller =
      sellerOrder?.sellerId
        ? await Seller.findById(sellerOrder.sellerId).select('_id name shopName location').lean()
        : null;

    const deliveryAddress = order.deliveryAddress || {};
    const deliveryCoords = Array.isArray(deliveryAddress.location?.coordinates)
      ? {
          lat: Number(deliveryAddress.location.coordinates[1]),
          lng: Number(deliveryAddress.location.coordinates[0]),
        }
      : null;
    const dropOtp = order.deliveryVerification?.dropOtp || {};
    const handoverOtp = String(order.deliveryOtp || '').trim();

    const returnedRequest = await QuickReturnRequest.findOne({ orderId: order._id }).select('_id').lean();
    const returnStatus = returnedRequest ? 'RETURN_REQUESTED' : order.returnStatus;

    return res.json({
      success: true,
      result: {
        ...order,
        returnStatus,
        id: order._id,
        _id: order._id,
        orderNumber: order.orderId,
        orderId: order.orderId,
        address: {
          type: deliveryAddress.label || 'Other',
          name: '',
          address: deliveryAddress.street || '',
          city: deliveryAddress.city || '',
          phone: deliveryAddress.phone || '',
          ...(deliveryCoords ? { location: deliveryCoords } : {}),
        },
        seller: seller
          ? {
              _id: seller._id,
              id: seller._id,
              name: seller.shopName || seller.name || 'Store',
              shopName: seller.shopName || seller.name || 'Store',
              location: seller.location || null,
            }
          : null,
        sellerOrder: sellerOrder
          ? {
              _id: sellerOrder._id,
              status: sellerOrder.status,
              workflowStatus: sellerOrder.workflowStatus,
              address: sellerOrder.address || null,
            }
          : null,
        deliveryVerification: {
          ...(order.deliveryVerification || {}),
          dropOtp: {
            required: Boolean(dropOtp.required),
            verified: Boolean(dropOtp.verified),
          },
        },
        ...(dropOtp.required && !dropOtp.verified && handoverOtp
          ? { handoverOtp }
          : {}),
      },
    });
  } catch (error) {
    logger.error(`Quick getOrderById failed: ${error?.message || error}`);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load quick order',
    });
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const idQuery = resolveId(req);

    if (!idQuery) {
      return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
    }

    const rawOrderId = String(req.params.orderId || '').trim();
    if (!rawOrderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    const orderIdentityQuery = [{ orderId: rawOrderId }];
    if (mongoose.isValidObjectId(rawOrderId)) {
      orderIdentityQuery.unshift({ _id: rawOrderId });
    }

    const query = {
      ...idQuery,
      orderType: 'quick',
      $or: orderIdentityQuery,
    };

    const order = await QuickOrder.findOne(query);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const currentStatus = String(order.orderStatus || '').toLowerCase();
    if (['delivered', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'].includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message: currentStatus === 'delivered' ? 'Delivered orders cannot be cancelled' : 'Order is already cancelled',
      });
    }

    order.orderStatus = 'cancelled_by_user';
    order.workflowStatus = 'CANCELLED';
    order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
    order.statusHistory.push({
      byRole: 'USER',
      from: currentStatus || '',
      to: 'cancelled_by_user',
      note: String(req.body?.reason || 'Quick commerce order cancelled by user').trim(),
    });

    if (order.payment?.method === 'cash') {
      order.payment.status = 'failed';
    }

    await order.save();

    await SellerOrder.updateMany(
      {
        orderId: order.orderId,
        status: { $nin: ['cancelled', 'delivered'] },
      },
      {
        $set: {
          status: 'cancelled',
          workflowStatus: 'CANCELLED',
        },
      },
    );

    emitQuickOrderStatusUpdate(order, 'Quick order cancelled successfully.');

    return res.json({
      success: true,
      result: {
        id: order._id,
        _id: order._id,
        orderId: order.orderId,
        orderNumber: order.orderId,
        status: order.orderStatus,
      },
    });
  } catch (error) {
    logger.error(`Quick cancelOrder failed: ${error?.message || error}`);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to cancel quick order',
    });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const idQuery = resolveId(req);

    if (!idQuery) {
      return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
    }

    const rawOrderId = String(req.params.orderId || '').trim();
    if (!rawOrderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ success: false, message: 'Missing Razorpay credentials' });
    }

    const orderIdentityQuery = [{ orderId: rawOrderId }];
    if (mongoose.isValidObjectId(rawOrderId)) {
      orderIdentityQuery.unshift({ _id: rawOrderId });
    }

    const query = {
      ...idQuery,
      orderType: 'quick',
      $or: orderIdentityQuery,
    };

    const order = await QuickOrder.findOne(query);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    let isAuthorized = false;
    try {
        const paymentInfo = await fetchRazorpayPayment(razorpayPaymentId);
        if (paymentInfo && (paymentInfo.status === 'captured' || paymentInfo.status === 'authorized')) {
            isAuthorized = true;
        }
    } catch (e) {
        logger.error(`Razorpay fetch failed: ${e.message}`);
    }

    if (!order.payment) order.payment = {};
    if (!order.payment.razorpay) order.payment.razorpay = {};
    
    order.payment.status = isAuthorized ? 'paid' : 'failed';
    order.payment.razorpay.paymentId = razorpayPaymentId;
    order.payment.razorpay.signature = razorpaySignature;
    order.payment.razorpay.status = isAuthorized ? 'captured' : 'failed';

    await order.save();

    if (isAuthorized) {
        await SellerOrder.updateMany(
            { orderId: order.orderId },
            { 
              $set: { 
                'payment.status': 'paid',
                'status': 'pending',
                'workflowStatus': 'SELLER_PENDING'
              } 
            }
        );
        const updatedSellerOrders = await SellerOrder.find({ orderId: order.orderId }).lean();
        emitQuickSellerOrders(updatedSellerOrders);
        emitQuickOrderStatusUpdate(order, 'Quick order payment verified and placed successfully.');
    }

    return res.json({
        success: true,
        message: 'Payment verified successfully',
        result: {
            id: order._id,
            status: order.orderStatus,
            paymentStatus: order.payment.status,
            paymentId: razorpayPaymentId
        }
    });
  } catch (error) {
    logger.error(`Quick verifyPayment failed: ${error?.message || error}`);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to verify payment',
    });
  }
};


