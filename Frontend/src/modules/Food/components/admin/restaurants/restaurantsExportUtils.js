// Export utility functions for restaurants

export const formatRestaurantId = (id) => {
  if (!id) return "REST000000"

  const idString = String(id)
  if (idString.startsWith("REST")) return idString

  const parts = idString.split(/[-.]/)
  let lastDigits = ""

  if (parts.length > 0) {
    const lastPart = parts[parts.length - 1]
    const digits = lastPart.match(/\d+/g)
    if (digits && digits.length > 0) {
      const allDigits = digits.join("")
      lastDigits = allDigits.slice(-6).padStart(6, "0")
    } else {
      const allParts = parts.join("")
      const allDigits = allParts.match(/\d+/g)
      if (allDigits && allDigits.length > 0) {
        const combinedDigits = allDigits.join("")
        lastDigits = combinedDigits.slice(-6).padStart(6, "0")
      }
    }
  }

  if (!lastDigits) {
    const hash = idString.split("").reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0) | 0
    }, 0)
    lastDigits = Math.abs(hash).toString().slice(-6).padStart(6, "0")
  }

  return `REST${lastDigits}`
}

const getRestaurantStatuses = (restaurant) => {
  const isActive = restaurant.isActive !== undefined 
    ? Boolean(restaurant.isActive) 
    : (restaurant.originalData?.isActive !== undefined 
        ? Boolean(restaurant.originalData.isActive) 
        : true)
  
  const rawApproval = restaurant.approvalStatus || restaurant.originalData?.status || "approved"
  const approval = String(rawApproval).charAt(0).toUpperCase() + String(rawApproval).slice(1).toLowerCase()

  return {
    approval,
    outletStatus: isActive ? "Active" : "Inactive"
  }
}

export const exportRestaurantsToExcel = (restaurants, filename = "restaurants") => {
  const headers = [
    "SI",
    "Restaurant ID",
    "Restaurant Name",
    "Owner Name",
    "Owner Phone",
    "Zone",
    "Approval",
    "Outlet Status",
    "Rating"
  ]
  
  const rows = restaurants.map((restaurant, index) => {
    const rawId = restaurant.restaurantId || restaurant.originalData?.restaurantId || restaurant.displayId || restaurant._id || restaurant.id
    const { approval, outletStatus } = getRestaurantStatuses(restaurant)
    return [
      index + 1,
      formatRestaurantId(rawId),
      restaurant.name || restaurant.restaurantName || "N/A",
      restaurant.ownerName || "N/A",
      restaurant.ownerPhone || restaurant.phone || "N/A",
      restaurant.zone || restaurant.zoneName || "N/A",
      approval,
      outletStatus,
      restaurant.rating || 0
    ]
  })
  
  const csvContent = [
    headers.join("\t"),
    ...rows.map(row => row.join("\t"))
  ].join("\n")
  
  const blob = new Blob([csvContent], { type: "application/vnd.ms-excel" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.xls`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportRestaurantsToPDF = (restaurants, filename = "restaurants") => {
  const headers = [
    "SI",
    "Restaurant ID",
    "Restaurant Name",
    "Owner Name",
    "Owner Phone",
    "Zone",
    "Approval",
    "Outlet Status",
    "Rating"
  ]
  
  const rows = restaurants.map((restaurant, index) => {
    const rawId = restaurant.restaurantId || restaurant.originalData?.restaurantId || restaurant.displayId || restaurant._id || restaurant.id
    const { approval, outletStatus } = getRestaurantStatuses(restaurant)
    return [
      index + 1,
      formatRestaurantId(rawId),
      restaurant.name || restaurant.restaurantName || "N/A",
      restaurant.ownerName || "N/A",
      restaurant.ownerPhone || restaurant.phone || "N/A",
      restaurant.zone || restaurant.zoneName || "N/A",
      approval,
      outletStatus,
      restaurant.rating || 0
    ]
  })
  
  const printWindow = window.open("", "_blank")
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${filename}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            padding: 20px; 
            margin: 0;
          }
          h1 { 
            text-align: center; 
            color: #1e293b;
            margin-bottom: 10px;
          }
          p { 
            text-align: center; 
            color: #64748b;
            margin-bottom: 20px;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px; 
            font-size: 12px;
          }
          th, td { 
            border: 1px solid #ddd; 
            padding: 8px; 
            text-align: left; 
          }
          th { 
            background-color: #3b82f6; 
            color: white; 
            font-weight: bold; 
          }
          tr:nth-child(even) { 
            background-color: #f9fafb; 
          }
          tr:hover { 
            background-color: #f1f5f9; 
          }
          @media print { 
            body { 
              margin: 0; 
              padding: 10px;
            }
            @page {
              margin: 1cm;
            }
          }
        </style>
      </head>
      <body>
        <h1>Restaurants List</h1>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                ${row.map(cell => `<td>${cell}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(() => window.close(), 100);
          }
        </script>
      </body>
    </html>
  `
  printWindow.document.write(htmlContent)
  printWindow.document.close()
}
