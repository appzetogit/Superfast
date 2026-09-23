import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"
import api, { API_ENDPOINTS } from "@food/api"

const DEFAULT_PRIVACY_CONTENT = `
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

export default function PrivacyPolicyPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [loading, setLoading] = useState(true)
  const [privacyData, setPrivacyData] = useState({ title: "Privacy Policy", content: "", updatedAt: "" })

  useEffect(() => {
    const fetchPrivacy = async () => {
      try {
        const response = await api.get(`${API_ENDPOINTS.ADMIN.PRIVACY_PUBLIC}?role=restaurant`)
        if (response?.data?.success) {
          const payload = response?.data?.data || {}
          setPrivacyData({
            title: payload?.title || "Privacy Policy",
            content: payload?.content || DEFAULT_PRIVACY_CONTENT,
            updatedAt: payload?.updatedAt || ""
          })
        } else {
          setPrivacyData({ title: "Privacy Policy", content: DEFAULT_PRIVACY_CONTENT, updatedAt: "" })
        }
      } catch (_) {
        setPrivacyData({ title: "Privacy Policy", content: DEFAULT_PRIVACY_CONTENT, updatedAt: "" })
      } finally {
        setLoading(false)
      }
    }

    fetchPrivacy()
  }, [])

  const activeContent = privacyData.content || DEFAULT_PRIVACY_CONTENT

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden pb-10">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-3 z-50 flex items-center gap-3">
        <button 
          onClick={goBack}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Privacy Policy</h1>
      </div>

      {/* Content */}
      <div className="px-4 py-6 pt-[4.5rem]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6"
        >
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">{privacyData.title || "Privacy Policy"}</h2>
            <p className="text-sm text-gray-600">
              Last updated: {(privacyData.updatedAt ? new Date(privacyData.updatedAt) : new Date()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">Loading privacy policy...</p>
          ) : (
            <div
              className="prose prose-sm max-w-none text-sm text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: activeContent }}
            />
          )}
        </motion.div>
      </div>
    </div>
  )
}

