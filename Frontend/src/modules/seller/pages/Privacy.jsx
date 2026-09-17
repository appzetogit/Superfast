import { useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { ArrowLeft, Shield, Loader2 } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@food/components/ui/button"
import api from "@food/api"
import { API_ENDPOINTS } from "@food/api/config"

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

export default function PrivacyPolicy() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [privacyData, setPrivacyData] = useState({
    title: 'Privacy Policy',
    content: ''
  })

  useEffect(() => {
    fetchPrivacyData()
  }, [])

  const fetchPrivacyData = async () => {
    try {
      setLoading(true)
      const response = await api.get(`${API_ENDPOINTS.ADMIN.PRIVACY_PUBLIC}?role=vendor`)
      if (response.data.success) {
        setPrivacyData({
          title: response.data.data?.title || 'Privacy Policy',
          content: response.data.data?.content || DEFAULT_PRIVACY_CONTENT
        })
      } else {
        setPrivacyData({ title: 'Privacy Policy', content: DEFAULT_PRIVACY_CONTENT })
      }
    } catch (error) {
      console.error('Error fetching privacy data:', error)
      setPrivacyData({ title: 'Privacy Policy', content: DEFAULT_PRIVACY_CONTENT })
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigate('/seller/auth')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#16a34a]" />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading...</p>
        </div>
      </div>
    )
  }

  const activeContent = privacyData.content || DEFAULT_PRIVACY_CONTENT

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] pb-10">
      {/* Premium Sticky Header */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-900">
        <div className="max-w-4xl mx-auto px-4 h-16 md:h-20 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            className="h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition-all active:scale-95"
          >
            <ArrowLeft className="h-6 w-6 text-gray-900 dark:text-white" />
          </Button>
          <div className="flex-1">
             <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
               {privacyData.title || "Vendor Privacy Policy"}
             </h1>
             <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Vendor Policy</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[#111] rounded-[2rem] p-6 md:p-10 shadow-sm border border-gray-50 dark:border-gray-900"
        >
          <div
            className="prose prose-slate dark:prose-invert max-w-none
              prose-headings:font-black prose-headings:text-gray-900 dark:prose-headings:text-white
              prose-p:text-gray-600 dark:prose-p:text-gray-400 prose-p:leading-relaxed
              prose-strong:text-gray-900 dark:prose-strong:text-white
              prose-a:text-[#16a34a] dark:prose-a:text-[#15803d]
              prose-li:text-gray-600 dark:prose-li:text-gray-400"
            dangerouslySetInnerHTML={{ __html: activeContent }}
          />
        </motion.div>

        <p className="text-center mt-10 text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] leading-relaxed">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} <br />
          © {new Date().getFullYear()} All Rights Reserved.
        </p>
      </div>
    </div>
  )
}
