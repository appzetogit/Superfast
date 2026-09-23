import mongoose from 'mongoose';
import { QuickCart } from '../models/cart.model.js';
import { QuickProduct } from '../models/product.model.js';
import { ensureQuickCommerceSeedData } from '../services/seed.service.js';
import { calculateQuickPricing } from '../admin/services/billing.service.js';
import { Seller } from '../seller/models/seller.model.js';

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
  const sessionId = String(req.headers['x-quick-session'] || req.query.sessionId || req.body.sessionId || '').trim();
  return sessionId ? { sessionId } : null;
};

const buildCartInsertDoc = (idQuery) => {
  if (!idQuery) return { items: [] };
  if (idQuery.userId) {
    return {
      userId: idQuery.userId,
      sessionId: `user:${String(idQuery.userId)}`,
      items: [],
    };
  }
  return {
    sessionId: String(idQuery.sessionId || '').trim(),
    items: [],
  };
};

const mapCart = async (idQuery) => {
  const cart = await QuickCart.findOne(idQuery).lean();
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    return { items: [], subtotal: 0, total: 0 };
  }

  const productIds = cart.items
    .map((item) => item.productId)
    .filter((id) => mongoose.isValidObjectId(id));

  const products = await QuickProduct.find({ _id: { $in: productIds }, ...approvedProductFilter }).lean();
  const productMap = products.reduce((acc, product) => {
    acc[String(product._id)] = product;
    return acc;
  }, {});

  const sellerIds = [...new Set(products.map(p => p.sellerId).filter(id => mongoose.isValidObjectId(id)))];
  const sellers = await Seller.find({ _id: { $in: sellerIds } }).lean();
  const sellerMap = sellers.reduce((acc, s) => {
    acc[String(s._id)] = s;
    return acc;
  }, {});

  const items = cart.items
    .map((item) => {
      const product = productMap[String(item.productId)];
      if (!product) return null;

      const variant = item.variantSku && Array.isArray(product.variants)
        ? product.variants.find((v) => v.sku === item.variantSku)
        : null;

      const unitPrice = variant
        ? (Number(variant.salePrice || 0) > 0 ? Number(variant.salePrice) : Number(variant.price || 0))
        : (Number(product.salePrice || 0) > 0 ? Number(product.salePrice) : Number(product.price || 0));

      const mrp = variant
        ? Number(variant.price || unitPrice || 0)
        : Number(product.mrp || product.price || unitPrice || 0);

      const name = variant ? `${product.name} (${variant.name})` : product.name;
      const weight = variant ? variant.name : (product.weight || product.unit || "1 unit");

        const seller = product.sellerId ? sellerMap[String(product.sellerId)] : null;
        
        return {
          id: variant ? `${product._id}::${variant.sku}` : String(product._id),
          productId: variant ? `${product._id}::${variant.sku}` : String(product._id),
          categoryId: product.categoryId ? String(product.categoryId) : null,
          subcategoryId: product.subcategoryId ? String(product.subcategoryId) : null,
          headerId: product.headerId ? String(product.headerId) : null,
          sellerId: product.sellerId ? String(product.sellerId) : null,
          storeName: seller?.shopName || seller?.name || '',
          name,
        image: product.mainImage || product.image || '',
        mainImage: product.mainImage || product.image || '',
        price: unitPrice,
        salePrice: variant ? Number(variant.salePrice || 0) : Number(product.salePrice || 0),
        mrp,
        originalPrice: mrp,
        unit: weight,
        weight,
        quantity: item.quantity,
        lineTotal: item.quantity * unitPrice,
        variantSku: item.variantSku || null,
      };
    })
    .filter(Boolean);

  const subtotal = items.reduce((acc, item) => acc + item.lineTotal, 0);
  const { pricing } = await calculateQuickPricing({
    subtotal,
    products,
  });

  return {
    items,
    subtotal,
    deliveryFee: Number(pricing?.deliveryFee || 0),
    handlingFee: Number(pricing?.handlingFee || 0),
    platformFee: Number(pricing?.platformFee || 0),
    tax: Number(pricing?.tax || 0),
    gst: Number(pricing?.gst || 0),
    total: Number(pricing?.total || subtotal),
    pricing,
  };
};

export const getCart = async (req, res) => {
  await ensureQuickCommerceSeedData();
  const idQuery = resolveId(req);

  if (!idQuery) {
    return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
  }

  const cart = await mapCart(idQuery);
  return res.json({ success: true, result: cart });
};

export const addToCart = async (req, res) => {
  await ensureQuickCommerceSeedData();

  const idQuery = resolveId(req);
  const { productId } = req.body;
  const quantity = Number(req.body.quantity || 1);

  if (!idQuery || !productId) {
    return res.status(400).json({ success: false, message: 'sessionId/userId and productId are required' });
  }

  const [parentId, variantSku] = String(productId).split("::");

  const product = await QuickProduct.findOne({ _id: parentId, ...approvedProductFilter }).lean();
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const cart = await QuickCart.findOneAndUpdate(
    idQuery,
    { $setOnInsert: buildCartInsertDoc(idQuery) },
    { upsert: true, new: true }
  );

  const itemIndex = cart.items.findIndex(
    (item) => String(item.productId) === parentId && item.variantSku === (variantSku || null)
  );
  if (itemIndex >= 0) {
    cart.items[itemIndex].quantity = Math.max(1, cart.items[itemIndex].quantity + Math.max(1, quantity));
  } else {
    cart.items.push({ productId: parentId, quantity: Math.max(1, quantity), variantSku: variantSku || null });
  }

  await cart.save();

  const result = await mapCart(idQuery);
  return res.json({ success: true, result });
};

export const updateCartItem = async (req, res) => {
  await ensureQuickCommerceSeedData();

  const idQuery = resolveId(req);
  const { productId, quantity } = req.body;

  if (!idQuery || !productId) {
    return res.status(400).json({ success: false, message: 'sessionId/userId and productId are required' });
  }

  const qty = Number(quantity);
  const cart = await QuickCart.findOne(idQuery);

  if (!cart) {
    return res.status(404).json({ success: false, message: 'Cart not found' });
  }

  const [parentId, variantSku] = String(productId).split("::");

  const itemIndex = cart.items.findIndex(
    (item) => String(item.productId) === parentId && item.variantSku === (variantSku || null)
  );
  if (itemIndex < 0) {
    return res.status(404).json({ success: false, message: 'Cart item not found' });
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    cart.items.splice(itemIndex, 1);
  } else {
    cart.items[itemIndex].quantity = Math.floor(qty);
  }

  await cart.save();
  const result = await mapCart(idQuery);
  return res.json({ success: true, result });
};

export const removeCartItem = async (req, res) => {
  await ensureQuickCommerceSeedData();

  const idQuery = resolveId(req);
  const { productId } = req.params;

  if (!idQuery || !productId) {
    return res.status(400).json({ success: false, message: 'sessionId/userId and productId are required' });
  }

  const cart = await QuickCart.findOne(idQuery);
  if (!cart) {
    return res.status(404).json({ success: false, message: 'Cart not found' });
  }

  const [parentId, variantSku] = String(productId).split("::");

  cart.items = cart.items.filter(
    (item) => !(String(item.productId) === parentId && item.variantSku === (variantSku || null))
  );
  await cart.save();

  const result = await mapCart(idQuery);
  return res.json({ success: true, result });
};

export const clearCart = async (req, res) => {
  await ensureQuickCommerceSeedData();

  const idQuery = resolveId(req);
  if (!idQuery) {
    return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
  }

  await QuickCart.findOneAndUpdate(
    idQuery,
    {
      $set: { items: [] },
      $setOnInsert: buildCartInsertDoc(idQuery),
    },
    { upsert: true, new: true }
  );
  return res.json({
    success: true,
    result: {
      items: [],
      subtotal: 0,
      deliveryFee: 0,
      handlingFee: 0,
      platformFee: 0,
      tax: 0,
      gst: 0,
      total: 0,
    },
  });
};

