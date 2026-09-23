import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { MapPin, Plus, Search, Edit, Trash2, Eye, ArrowLeft, Building2 } from "lucide-react"
import { adminApi } from "../services/adminApi"
import Pagination from "@shared/components/ui/Pagination"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function ZoneSetup() {
  const navigate = useNavigate()
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedZone, setSelectedZone] = useState(null)
  const [sellers, setSellers] = useState([])
  const [loadingSellers, setLoadingSellers] = useState(false)
  const [currentSellerPage, setCurrentSellerPage] = useState(1)
  const [sellerPageSize, setSellerPageSize] = useState(25)

  useEffect(() => {
    if (selectedZone) {
      fetchSellers(selectedZone._id || selectedZone.id)
    }
  }, [selectedZone])

  const fetchSellers = async (zoneId) => {
    try {
      setLoadingSellers(true)
      const response = await adminApi.getSellerRequests({ zoneId, status: 'approved', limit: 1000 })
      const items = response?.data?.result?.items || response?.data?.data?.items || response?.data?.result || []
      setSellers(Array.isArray(items) ? items : [])
    } catch (error) {
      debugError("Error fetching zone sellers:", error)
      setSellers([])
    } finally {
      setLoadingSellers(false)
    }
  }

  const paginatedSellers = useMemo(() => {
    const start = (currentSellerPage - 1) * sellerPageSize
    return sellers.slice(start, start + sellerPageSize)
  }, [sellers, currentSellerPage, sellerPageSize])

  const totalSellerPages = Math.ceil(sellers.length / sellerPageSize) || 1

  useEffect(() => {
    setCurrentSellerPage(1)
  }, [sellerPageSize, selectedZone])

  useEffect(() => {
    fetchZones()
  }, [])

  const fetchZones = async () => {
    try {
      setLoading(true)
      const response = await adminApi.getZones()
      if (response.data?.success && response.data.data?.zones) {
        setZones(response.data.data.zones)
      }
    } catch (error) {
      debugError("Error fetching zones:", error)
      setZones([])
    } finally {
      setLoading(false)
    }
  }


  const handleDeleteZone = async (zoneId) => {
    if (!window.confirm("Are you sure you want to delete this zone?")) {
      return
    }
    try {
      await adminApi.deleteZone(zoneId)
      alert("Zone deleted successfully!")
      fetchZones()
    } catch (error) {
      debugError("Error deleting zone:", error)
      alert(error.response?.data?.message || "Failed to delete zone")
    }
  }

  const filteredZones = zones.filter(zone =>
    zone.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    zone.serviceLocation?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (selectedZone) {
    return (
      <div className="p-2 lg:p-3 bg-slate-50 min-h-screen">
        <div className="w-full mx-auto max-w-7xl">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => setSelectedZone(null)}
              className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{selectedZone.name || "Zone Sellers"}</h1>
              <p className="text-sm text-slate-600">Sellers in {selectedZone.serviceLocation || "this zone"}</p>
            </div>
          </div>

          {/* Sellers list */}
          {loadingSellers ? (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Loading sellers...</p>
            </div>
          ) : sellers.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
              <Building2 className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No sellers found</h3>
              <p className="text-slate-600">
                There are no approved sellers registered under this zone yet.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                      <th className="px-6 py-4">Seller</th>
                      <th className="px-6 py-4">Contact</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Location</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm text-slate-700">
                    {paginatedSellers.map((seller) => (
                      <tr key={seller._id || seller.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                              <Building2 className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{seller.shopName || "Store"}</p>
                              <p className="text-xs text-slate-500">{seller.ownerName || "Seller"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-900">{seller.email || "No email"}</p>
                          <p className="text-xs text-slate-500">{seller.phone || "No phone"}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                            {seller.category || "General"}
                          </span>
                        </td>
                        <td className="px-6 py-4 max-w-[200px] truncate">
                          <span className="text-xs text-slate-600" title={seller.location}>{seller.location || "N/A"}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            seller.status === "approved" || seller.isActive ? "bg-green-100 text-green-800" :
                            "bg-yellow-100 text-yellow-800"
                          }`}>
                            {seller.status || (seller.isActive ? "approved" : "pending")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sellers.length > 0 && (
                <Pagination
                  page={currentSellerPage}
                  totalPages={totalSellerPages}
                  total={sellers.length}
                  pageSize={sellerPageSize}
                  onPageChange={setCurrentSellerPage}
                  onPageSizeChange={(size) => {
                    setSellerPageSize(size)
                    setCurrentSellerPage(1)
                  }}
                  className="border-t-0 rounded-b-xl"
                />
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-2 lg:p-3 bg-slate-50 min-h-screen">
      <div className="w-full mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex items-center gap-3 mb-4 md:mb-0">
            <div className="w-10 h-10 rounded-lg bg-[#0c831f] flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Zone Setup Quick Commerce</h1>
              <p className="text-sm text-slate-600">Manage delivery zones for quick commerce</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/admin/quick-commerce/zone-setup/add")}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Add Zone</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search zones by name or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Zones List */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600">Loading zones...</p>
          </div>
        ) : filteredZones.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
            <MapPin className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No zones found</h3>
            <p className="text-slate-600 mb-6">
              {searchQuery ? "Try adjusting your search query" : "Create your first quick-commerce delivery zone to get started"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => navigate("/admin/quick-commerce/zone-setup/add")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Add Zone</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredZones.map((zone) => (
              <div
                key={zone._id || zone.id}
                className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedZone(zone)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">{zone.name || "Unnamed Zone"}</h3>
                    <p className="text-sm text-slate-600">{zone.serviceLocation || "N/A"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/admin/quick-commerce/zone-setup/view/${zone._id || zone.id}`) }}
                      className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/admin/quick-commerce/zone-setup/edit/${zone._id || zone.id}`) }}
                      className="p-2 text-slate-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteZone(zone._id || zone.id) }}
                      className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Unit:</span>
                    <span className="font-medium text-slate-900">{zone.unit || "km"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      zone.isActive ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-800"
                    }`}>
                      {zone.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {zone.coordinates && zone.coordinates.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Points:</span>
                      <span className="font-medium text-slate-900">{zone.coordinates.length}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
