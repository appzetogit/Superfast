// Upserts customer-facing policy pages (role "user") into food_page_contents and adds the
// Shipping / Cancellation links to the landing-page footer. Safe to re-run.
import 'dotenv/config';
import mongoose from 'mongoose';

const EMAIL = 'support@superfastfood.in';
const UPDATED = '27 October 2026';
const contact = `<h3>Contact Us</h3>
<p>For any question about this policy, write to us at <a href="mailto:${EMAIL}">${EMAIL}</a>. You can also reach us from the <strong>Support</strong> section of the Superfast app. We aim to reply within 24-48 hours.</p>`;
const head = (t) => `<h2>${t}</h2><p><em>Last updated: ${UPDATED}</em></p>`;

const pages = {
  terms: {
    title: 'Terms and Conditions',
    content: `${head('Terms and Conditions')}
<p>Welcome to <strong>Superfast</strong>. By downloading the Superfast app, creating an account or placing an order, you agree to these Terms and Conditions. Please read them carefully.</p>
<h3>1. About Superfast</h3>
<p>Superfast is an online platform that lets you order food from partner restaurants and groceries / daily essentials from partner sellers, delivered to your address by independent delivery partners. Superfast acts as an intermediary between you and the restaurant or seller who prepares or supplies your order.</p>
<h3>2. Eligibility and Account</h3>
<ul>
<li>You must be at least 18 years old, or use the service under the supervision of a parent or guardian.</li>
<li>You sign in with your mobile number and a one-time password (OTP). You are responsible for all activity under your account.</li>
<li>You must provide accurate name, phone number and delivery address. We may suspend accounts that give false information or misuse the service.</li>
</ul>
<h3>3. Orders and Pricing</h3>
<ul>
<li>All prices are in Indian Rupees (INR) and are shown before you confirm the order. Taxes, delivery fee, packaging and platform charges, where applicable, are displayed at checkout.</li>
<li>Menu items, prices and availability are set by restaurants and sellers and may change without notice. An order is confirmed only after the restaurant or seller accepts it.</li>
<li>If an item becomes unavailable, we may contact you, substitute with your consent, or cancel that item and refund the amount.</li>
</ul>
<h3>4. Payments</h3>
<ul>
<li>You can pay online (UPI, cards, net banking, wallets) through our payment partner <strong>Razorpay</strong>, using your Superfast wallet, or by Cash on Delivery where offered.</li>
<li>We do not store your card, UPI or banking credentials. Online payments are processed on the secure systems of the payment gateway.</li>
<li>If money is debited but your order is not confirmed, the amount is refunded automatically as described in our Refund Policy.</li>
</ul>
<h3>5. Delivery</h3>
<p>Delivery time is an estimate and may vary due to traffic, weather, restaurant preparation time or high demand. Please see our Shipping &amp; Delivery Policy for details.</p>
<h3>6. Cancellations and Refunds</h3>
<p>Cancellations and refunds are governed by our Cancellation Policy and Refund Policy, which form part of these Terms.</p>
<h3>7. Your Responsibilities</h3>
<ul>
<li>Be available at the delivery address and reachable on your phone.</li>
<li>Do not place fake or abusive orders, misuse offers or coupons, or harass delivery partners or restaurant staff.</li>
<li>Do not attempt to hack, copy or disrupt the app.</li>
</ul>
<h3>8. Food Safety and Allergies</h3>
<p>Restaurants are responsible for the preparation, quality and hygiene of the food. Superfast does not prepare the food. If you have allergies, please contact the restaurant before ordering.</p>
<h3>9. Limitation of Liability</h3>
<p>To the extent permitted by law, Superfast is not liable for indirect or consequential losses. Our total liability for any order is limited to the amount you paid for that order.</p>
<h3>10. Changes to the Terms</h3>
<p>We may update these Terms from time to time. Continued use of the app after changes means you accept the updated Terms.</p>
<h3>11. Governing Law</h3>
<p>These Terms are governed by the laws of India. Courts in India will have jurisdiction over any dispute.</p>
${contact}`,
  },

  privacy: {
    title: 'Privacy Policy',
    content: `${head('Privacy Policy')}
<p>Superfast ("we", "us") respects your privacy. This policy explains what information we collect when you use the Superfast app and website, how we use it, and the choices you have.</p>
<h3>1. Information We Collect</h3>
<ul>
<li><strong>Account details:</strong> name, mobile number, email address (if provided), profile photo.</li>
<li><strong>Delivery details:</strong> saved addresses and location, so we can show nearby restaurants and deliver your order.</li>
<li><strong>Order details:</strong> items ordered, amounts, order history, ratings and reviews, support conversations.</li>
<li><strong>Payment information:</strong> payment status and transaction IDs. Card, UPI and bank details are entered on, and handled by, our payment partner Razorpay. We do not store them.</li>
<li><strong>Device and usage data:</strong> device type, app version, IP address, push-notification token and basic app usage.</li>
<li><strong>Location:</strong> with your permission, your device location to find your delivery address and to show live order tracking.</li>
</ul>
<h3>2. How We Use Your Information</h3>
<ul>
<li>To create your account, verify you with OTP and process your orders.</li>
<li>To share required details with the restaurant / seller and the delivery partner so your order can be prepared and delivered.</li>
<li>To process payments, refunds and wallet transactions.</li>
<li>To send order updates, offers and service notifications (you can turn off promotional notifications).</li>
<li>To provide customer support, prevent fraud and improve our services.</li>
</ul>
<h3>3. Sharing of Information</h3>
<p>We do not sell your personal information. We share it only with:</p>
<ul>
<li>Restaurants / sellers and delivery partners, limited to what is needed to fulfil your order (name, phone number, address).</li>
<li>Payment gateway and service providers (such as SMS, push notification, maps and hosting) who process data on our behalf.</li>
<li>Authorities, when required by law or to protect rights and safety.</li>
</ul>
<h3>4. Data Security and Retention</h3>
<p>We use reasonable technical and organisational safeguards to protect your data. We keep your information while your account is active and as long as needed for legal, tax and dispute-resolution purposes.</p>
<h3>5. Your Choices and Rights</h3>
<ul>
<li>You can view and edit your profile and addresses in the app.</li>
<li>You can turn off location access or notifications in your phone settings. Some features may not work without them.</li>
<li>You can request deletion of your account and data from the app's account settings, or by emailing us.</li>
</ul>
<h3>6. Children</h3>
<p>Superfast is not meant for children under 13, and we do not knowingly collect their data.</p>
<h3>7. Changes to this Policy</h3>
<p>We may update this policy from time to time. The latest version is always available in the app and on our website.</p>
${contact}`,
  },

  refund: {
    title: 'Refund Policy',
    content: `${head('Refund Policy')}
<p>We want you to be happy with every order. This policy explains when you are eligible for a refund and how it is paid back.</p>
<h3>1. When You Get a Refund</h3>
<ul>
<li>Your order is cancelled by you before the restaurant / seller starts preparing it (see Cancellation Policy).</li>
<li>Your order is cancelled by the restaurant, seller or Superfast (for example, items unavailable, restaurant closed, or no delivery partner available).</li>
<li>Items are missing, wrong or damaged, or the food is of unacceptable quality. Please report this within <strong>24 hours</strong> of delivery, with a photo where possible.</li>
<li>Your order was not delivered.</li>
<li>Money was debited from your account but the order was not placed (failed or duplicate payment).</li>
</ul>
<h3>2. When a Refund May Not Be Given</h3>
<ul>
<li>Wrong address or phone number given by you, or you were not available to receive the order.</li>
<li>Complaints about taste or personal preference, where the food was prepared and delivered as ordered.</li>
<li>Orders cancelled after the food has been prepared or picked up.</li>
</ul>
<h3>3. How Refunds Are Paid</h3>
<ul>
<li><strong>Online payments</strong> (UPI, cards, net banking, wallets) are refunded to the <strong>original payment method</strong>, or to your Superfast wallet if you choose that option. Original-method refunds usually reach you within <strong>5-7 working days</strong>, depending on your bank.</li>
<li><strong>Superfast wallet</strong> refunds are credited to your wallet instantly or within 24 hours.</li>
<li><strong>Cash on Delivery</strong> orders have nothing to refund if cancelled before payment. If a refund is approved after delivery, it is credited to your Superfast wallet.</li>
</ul>
<h3>4. How to Request a Refund</h3>
<p>Open <strong>My Orders</strong> in the app, select the order and choose <strong>Help / Report an issue</strong>, or email us at <a href="mailto:${EMAIL}">${EMAIL}</a> with your order ID. We will review your request and update you within 24-48 hours.</p>
${contact}`,
  },

  cancellation: {
    title: 'Cancellation Policy',
    content: `${head('Cancellation Policy')}
<h3>1. Cancellation by You</h3>
<ul>
<li>You can cancel an order from the <strong>My Orders</strong> screen until the restaurant / seller has accepted it and started preparing it. A full refund is given.</li>
<li>Once preparation has started or the order has been picked up, it may not be possible to cancel. If we allow it, a cancellation charge up to the cost of the food may apply, because the restaurant has already incurred it.</li>
</ul>
<h3>2. Cancellation by Restaurant, Seller or Superfast</h3>
<p>We may cancel an order if the restaurant is closed, items are unavailable, the delivery address is outside our service area, no delivery partner is available, there is a payment or technical issue, or we suspect fraud. You will be told the reason, and the <strong>full amount</strong> is refunded as described in our Refund Policy.</p>
<h3>3. Repeated Cancellations</h3>
<p>We may limit or suspend accounts that cancel orders repeatedly or place fake orders.</p>
<h3>4. Refund After Cancellation</h3>
<p>Refunds for cancelled orders follow our Refund Policy: original payment method in 5-7 working days, or Superfast wallet.</p>
${contact}`,
  },

  shipping: {
    title: 'Shipping & Delivery Policy',
    content: `${head('Shipping &amp; Delivery Policy')}
<p>Superfast delivers food and groceries from nearby restaurants and sellers to your doorstep.</p>
<h3>1. Service Area</h3>
<p>We deliver only within the areas served in your city. Enter your address in the app to see whether delivery is available and which restaurants / sellers are near you.</p>
<h3>2. Delivery Time</h3>
<p>The estimated delivery time is shown before you place the order and during live tracking. It depends on the restaurant's preparation time, distance, traffic, weather and demand, so it is an estimate and not a guarantee. Food is typically delivered within 30-60 minutes, and grocery orders usually sooner.</p>
<h3>3. Delivery Charges</h3>
<p>Delivery fee, packaging and other charges, if any, are shown at checkout before you pay. Some orders may qualify for free delivery through offers.</p>
<h3>4. Live Tracking</h3>
<p>Once a delivery partner is assigned, you can track your order and contact the delivery partner from the app.</p>
<h3>5. Receiving Your Order</h3>
<ul>
<li>Please keep your phone reachable and be available at the address. The delivery partner may ask for a delivery OTP, which you should share only on receiving the order.</li>
<li>If we cannot reach you or deliver after reasonable attempts, the order may be cancelled and no refund may be given, since the food has been prepared.</li>
</ul>
<h3>6. Delays and Non-Delivery</h3>
<p>If your order is significantly delayed or not delivered, contact support from the app. Eligible orders are refunded as per our Refund Policy.</p>
<h3>7. Packaging</h3>
<p>Please check the order and its packaging at the time of delivery and report any problem within 24 hours.</p>
${contact}`,
  },

  support: {
    title: 'Support & Help',
    content: `<h2>Support &amp; Help</h2>
<p>We are here to help with your orders, payments, refunds and account.</p>
<h3>Get Help</h3>
<ul>
<li><strong>In the app:</strong> My Orders &rarr; select an order &rarr; Help / Report an issue.</li>
<li><strong>Email:</strong> <a href="mailto:${EMAIL}">${EMAIL}</a>. Please include your registered phone number and order ID. We reply within 24-48 hours.</li>
</ul>
<h3>Common Questions</h3>
<p><strong>My payment was deducted but the order failed.</strong> The amount is refunded automatically to the original payment method within 5-7 working days.</p>
<p><strong>I want to cancel my order.</strong> Open My Orders and cancel before the restaurant starts preparing it. See our Cancellation Policy.</p>
<p><strong>I received a wrong or missing item.</strong> Report it from My Orders within 24 hours of delivery. See our Refund Policy.</p>
<p><strong>I want to delete my account.</strong> Use the account settings in the app, or email us.</p>`,
  },
};

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const now = new Date();

for (const [key, legal] of Object.entries(pages)) {
  const r = await db.collection('food_page_contents').updateOne(
    { key, role: 'user' },
    { $set: { key, role: 'user', legal, updatedByRole: 'ADMIN', updatedAt: now }, $setOnInsert: { createdAt: now, updatedBy: null } },
    { upsert: true },
  );
  console.log(key, r.upsertedCount ? 'inserted' : 'updated');
}

// Landing footer: show every policy page + contact email. Other landing fields stay untouched.
const footerLinks = [
  { label: 'About', url: '/profile/about' },
  { label: 'Terms & Conditions', url: '/profile/terms' },
  { label: 'Privacy Policy', url: '/profile/privacy' },
  { label: 'Refund Policy', url: '/profile/refund' },
  { label: 'Cancellation Policy', url: '/profile/cancellation' },
  { label: 'Shipping & Delivery', url: '/profile/shipping' },
  { label: 'Support', url: '/profile/support' },
];
const g = await db.collection('common_global_settings').updateOne(
  {},
  { $set: { 'landingPage.footer.links': footerLinks, 'landingPage.footer.email': EMAIL } },
);
console.log('landing footer updated:', g.modifiedCount);

await mongoose.disconnect();
