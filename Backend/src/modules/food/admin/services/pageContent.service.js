import { FoodPageContent } from '../models/pageContent.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

const normalizeKey = (key) => String(key || '').trim().toLowerCase();

const decodeHtmlEntities = (value) => {
    if (value === null || value === undefined) return value;
    let s = String(value);
    if (!s.includes('&')) return s;
    return s
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
};

const normalizeLegalForResponse = (legal) => {
    if (!legal || typeof legal !== 'object') return legal;
    const title = legal.title ?? '';
    const content = decodeHtmlEntities(legal.content ?? '');
    return { ...legal, title, content };
};

const normalizeAboutForResponse = (about) => {
    if (!about || typeof about !== 'object') return about;
    return {
        ...about,
        appName: decodeHtmlEntities(about.appName ?? ''),
        version: decodeHtmlEntities(about.version ?? ''),
        description: decodeHtmlEntities(about.description ?? ''),
        logo: decodeHtmlEntities(about.logo ?? '')
    };
};

const DEFAULT_VENDOR_PRIVACY_POLICY = `
<h2>Superfast Vendor & Restaurant Privacy Policy</h2>
<p>Welcome to <strong>Superfast Partner Platform</strong>. We value your privacy and are committed to protecting the personal and business data of our merchant partners, restaurants, and seller accounts.</p>

<h3>1. Information We Collect</h3>
<p>When you register as a vendor or restaurant partner on Superfast, we collect details necessary to operate your account and process customer orders, including:</p>
<ul>
  <li><strong>Business Information:</strong> Store/Restaurant name, store address, business license numbers (e.g. FSSAI, GSTIN, PAN), and bank details for settlements.</li>
  <li><strong>Contact Details:</strong> Account owner name, phone number, email address, and store manager contact details.</li>
  <li><strong>Operational Data:</strong> Store opening hours, menu/catalog items, pricing, inventory details, order fulfillment history, and payout transaction records.</li>
  <li><strong>Device & Location Data:</strong> Device identifiers, IP address, and location data used for order dispatching and live partner tracking.</li>
</ul>

<h3>2. How We Use Your Information</h3>
<p>We use vendor data for essential business purposes:</p>
<ul>
  <li>Processing customer orders and dispatching delivery partners to your store location.</li>
  <li>Calculating and disbursing vendor payouts to your registered bank account.</li>
  <li>Providing real-time order alerts, analytics, customer support, and dispute resolution.</li>
  <li>Ensuring compliance with local commercial regulations and food safety standards.</li>
</ul>

<h3>3. Data Sharing & Disclosure</h3>
<p>We do not sell your business or personal data. We share necessary vendor information only with:</p>
<ul>
  <li><strong>Customers:</strong> Store name, location address, catalog items, and order status updates.</li>
  <li><strong>Delivery Partners:</strong> Store pickup address and store contact number for pickup coordination.</li>
  <li><strong>Financial Partners & Payment Gateways:</strong> Banking details required strictly for processing daily/weekly settlements.</li>
  <li><strong>Legal Authorities:</strong> When required by applicable laws or regulatory requests.</li>
</ul>

<h3>4. Data Security & Storage</h3>
<p>We employ industry-standard encryption, access controls, and secure server architecture to safeguard your store data and banking credentials against unauthorized access or breaches.</p>

<h3>5. Vendor Rights & Account Deletion</h3>
<p>Vendors have the right to access, update, or correct their store profile information at any time via the Superfast Vendor Panel. If you wish to terminate your seller account or request data deletion, please contact our Merchant Support Team at <a href="mailto:support@superfastfood.in">support@superfastfood.in</a>.</p>

<h3>6. Contact Us</h3>
<p>If you have any questions regarding this Privacy Policy or vendor data handling practices, please contact us at:</p>
<p><strong>Superfast Merchant Support</strong><br/>Email: support@superfastfood.in</p>
`;

export const getPublicPageByKey = async (key, role = 'user') => {
    const k = normalizeKey(key);
    const r = String(role || 'user').toLowerCase();
    
    const doc = await FoodPageContent.findOne({ key: k, role: r }).lean();
    if (!doc) {
        const defaultTitles = {
            cancellation: 'Cancellation Policy',
            refund: 'Refund Policy',
            shipping: 'Shipping Policy',
            privacy: 'Privacy Policy',
            terms: 'Terms and Conditions',
            support: 'Support & Help',
            about: 'About Us'
        };
        if (k === 'about') {
            return {
                key: k,
                role: r,
                data: { appName: 'Superfast', version: '1.0.0', description: '', logo: '', features: [], stats: [] }
            };
        }
        let defaultContent = '';
        if (k === 'privacy') {
            defaultContent = DEFAULT_VENDOR_PRIVACY_POLICY;
        }
        return { key: k, role: r, data: { title: defaultTitles[k] || 'Page Content', content: defaultContent } };
    }
    if (k === 'about') return { key: k, role: r, data: normalizeAboutForResponse(doc.about || null) };
    const normalized = normalizeLegalForResponse(doc.legal || null);
    if (!normalized?.content && k === 'privacy') {
        normalized.content = DEFAULT_VENDOR_PRIVACY_POLICY;
    }
    return { key: k, role: r, data: normalized };
};

export const getAdminPageByKey = async (key, role = 'user') => getPublicPageByKey(key, role);

export const upsertLegalPage = async (key, payload, updatedBy, role = 'user') => {
    const k = normalizeKey(key);
    const r = String(role || 'user').toLowerCase();
    
    if (!['terms', 'privacy', 'refund', 'shipping', 'cancellation', 'support'].includes(k)) {
        throw new ValidationError('Invalid page key');
    }
    const title = String(payload?.title || '').trim();
    const content = decodeHtmlEntities(String(payload?.content || '')).trim();

    const doc = await FoodPageContent.findOneAndUpdate(
        { key: k, role: r },
        {
            $set: {
                key: k,
                role: r,
                legal: { title, content },
                updatedBy: updatedBy || null,
                updatedByRole: 'ADMIN'
            },
            $unset: { about: 1 }
        },
        { upsert: true, new: true }
    ).lean();

    return { key: k, role: r, data: normalizeLegalForResponse(doc?.legal || null) };
};

export const upsertAboutPage = async (payload, updatedBy) => {
    const appName = decodeHtmlEntities(String(payload?.appName || '')).trim() || 'Superfast Food';
    const version = decodeHtmlEntities(String(payload?.version || '')).trim() || '1.0.0';
    const description = decodeHtmlEntities(String(payload?.description || '')).trim();
    const logo = decodeHtmlEntities(String(payload?.logo || '')).trim();
    const features = Array.isArray(payload?.features) ? payload.features : [];
    const stats = Array.isArray(payload?.stats) ? payload.stats : [];

    const normalizedFeatures = features.map((f, idx) => ({
        icon: String(f?.icon || 'Heart'),
        title: String(f?.title || ''),
        description: String(f?.description || ''),
        color: String(f?.color || ''),
        bgColor: String(f?.bgColor || ''),
        order: Number.isFinite(Number(f?.order)) ? Number(f.order) : idx
    }));

    const doc = await FoodPageContent.findOneAndUpdate(
        { key: 'about', role: 'all' },
        {
            $set: {
                key: 'about',
                role: 'all',
                about: { appName, version, description, logo, features: normalizedFeatures, stats },
                updatedBy: updatedBy || null,
                updatedByRole: 'ADMIN'
            },
            $unset: { legal: 1 }
        },
        { upsert: true, new: true }
    ).lean();

    return { key: 'about', role: 'all', data: normalizeAboutForResponse(doc?.about || null) };
};

