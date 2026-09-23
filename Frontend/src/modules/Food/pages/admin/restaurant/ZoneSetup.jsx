import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { MapPin, Plus, Search, Edit, Trash2, Eye, Map, Bike, ArrowLeft, Building2 } from "lucide-react"
import { adminAPI } from "@food/api"
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
  const [restaurants, setRestaurants] = useState([])
  const [loadingRestaurants, setLoadingRestaurants] = useState(false)

  const [currentRestPage, setCurrentRestPage] = useState(1)
  const [restPageSize, setRestPageSize] = useState(25)

  useEffect(() => {
    fetchZones()
  }, [])

  useEffect(() => {
    if (selectedZone) {
      fetchRestaurants(selectedZone._id || selectedZone.id)
    }
  }, [selectedZone])

  const handleRankChange = async (restaurantId, newRank) => {
    const rankNum = Number(newRank)
    if (rankNum > 0) {
      const alreadyAssigned = restaurants.find(r => Number(r.priority) === rankNum && (r._id || r.id) !== restaurantId)
      if (alreadyAssigned) {
        alert(`Rank ${rankNum} is already assigned to "${alreadyAssigned.restaurantName || alreadyAssigned.name}". Please choose another rank.`)
        return
      }
    }

    try {
      await adminAPI.updateRestaurant(restaurantId, { priority: rankNum })
      setRestaurants(prev => {
        const updated = prev.map(r => {
          if ((r._id || r.id) === restaurantId) {
            return { ...r, priority: rankNum }
          }
          return r
        })
        return [...updated].sort((a, b) => {
          const prioA = Number(a.priority) || 999
          const prioB = Number(b.priority) || 999
          return prioA - prioB
        })
      })
    } catch (error) {
      debugError("Error updating restaurant rank:", error)
      alert("Failed to update rank")
    }
  }

  const isRankTaken = (rankValue, currentRestaurantId) => {
    if (rankValue === 0) return false
    return restaurants.some(r => Number(r.priority) === Number(rankValue) && (r._id || r.id) !== currentRestaurantId)
  }

  const fetchRestaurants = async (zoneId) => {
    try {
      setLoadingRestaurants(true)
      const response = await adminAPI.getRestaurants({ zoneId, limit: 1000 })
      if (response.data?.success && response.data.data?.restaurants) {
        const sorted = [...response.data.data.restaurants].sort((a, b) => {
          const prioA = Number(a.priority) || 999
          const prioB = Number(b.priority) || 999
          return prioA - prioB
        })
        setRestaurants(sorted)
      } else if (response.data?.restaurants) {
        const sorted = [...response.data.restaurants].sort((a, b) => {
          const prioA = Number(a.priority) || 999
          const prioB = Number(b.priority) || 999
          return prioA - prioB
        })
        setRestaurants(sorted)
      } else {
        setRestaurants([])
      }
    } catch (error) {
      debugError("Error fetching zone restaurants:", error)
      setRestaurants([])
    } finally {
      setLoadingRestaurants(false)
    }
  }

  const fetchZones = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getZones()
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
      await adminAPI.deleteZone(zoneId)
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

  const paginatedRestaurants = useMemo(() => {
    const start = (currentRestPage - 1) * restPageSize
    return restaurants.slice(start, start + restPageSize)
  }, [restaurants, currentRestPage, restPageSize])

  const totalRestPages = Math.ceil(restaurants.length / restPageSize) || 1

  useEffect(() => {
    setCurrentRestPage(1)
  }, [restPageSize, selectedZone])

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
              <h1 className="text-2xl font-bold text-slate-900">{selectedZone.name || "Zone Restaurants"}</h1>
              <p className="text-sm text-slate-600">Restaurants in {selectedZone.serviceLocation || "this zone"}</p>
            </div>
          </div>

          {/* Restaurants list */}
          {loadingRestaurants ? (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Loading restaurants...</p>
            </div>
          ) : restaurants.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
              <Building2 className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No restaurants found</h3>
              <p className="text-slate-600">
                There are no restaurants registered under this zone yet.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                      <th className="px-6 py-4">Restaurant</th>
                      <th className="px-6 py-4">Rank</th>
                      <th className="px-6 py-4">Owner Info</th>
                      <th className="px-6 py-4">Area & City</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm text-slate-700">
                    {paginatedRestaurants.map((restaurant) => (
                      <tr key={restaurant._id || restaurant.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {restaurant.profileImage ? (
                              <img
                                src={restaurant.profileImage}
                                alt={restaurant.restaurantName}
                                className="w-10 h-10 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <Building2 className="w-5 h-5" />
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-slate-900">{restaurant.restaurantName}</p>
                              <p className="text-xs text-slate-500">{restaurant.cuisines?.join(", ") || "No cuisines"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={restaurant.priority || 0}
                            onChange={(e) => handleRankChange(restaurant._id || restaurant.id, e.target.value)}
                            className="bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                          >
                            <option value={0}>None</option>
                            {[...Array(10)].map((_, i) => {
                              const rankVal = i + 1
                              const isTaken = isRankTaken(rankVal, restaurant._id || restaurant.id)
                              return (
                                <option key={rankVal} value={rankVal}>
                                  {rankVal} {isTaken ? "(Taken)" : ""}
                                </option>
                              )
                            })}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-900">{restaurant.ownerName}</p>
                          <p className="text-xs text-slate-500">{restaurant.ownerPhone}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-900">{restaurant.area || "N/A"}</p>
                          <p className="text-xs text-slate-500">{restaurant.city || "N/A"}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            restaurant.status === "approved" ? "bg-green-100 text-green-800" :
                            restaurant.status === "pending" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"
                          }`}>
                            {restaurant.status || "pending"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {restaurants.length > 0 && (
                <Pagination
                  page={currentRestPage}
                  totalPages={totalRestPages}
                  total={restaurants.length}
                  pageSize={restPageSize}
                  onPageChange={setCurrentRestPage}
                  onPageSizeChange={(size) => {
                    setRestPageSize(size)
                    setCurrentRestPage(1)
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
            <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Zone Setup Restaurant</h1>
              <p className="text-sm text-slate-600">Manage delivery zones for restaurants</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/admin/food/zone-setup/delivery-boy-view")}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Bike className="w-5 h-5" />
              <span>Delivery Boy View</span>
            </button>
            <button
              onClick={() => navigate("/admin/food/zone-setup/map")}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Map className="w-5 h-5" />
              <span>View Map</span>
            </button>
            <button
              onClick={() => navigate("/admin/food/zone-setup/add")}
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
              {searchQuery ? "Try adjusting your search query" : "Create your first delivery zone to get started"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => navigate("/admin/food/zone-setup/add")}
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
                      onClick={(e) => { e.stopPropagation(); navigate(`/admin/food/zone-setup/view/${zone._id || zone.id}`); }}
                      className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/admin/food/zone-setup/edit/${zone._id || zone.id}`); }}
                      className="p-2 text-slate-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteZone(zone._id || zone.id); }}
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

