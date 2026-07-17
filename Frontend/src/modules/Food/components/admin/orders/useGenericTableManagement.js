import { useState, useMemo } from "react"
import { exportToCSV, exportToExcel, exportToPDF } from './ordersExportUtils'
import { NotoSansDevanagariBase64 } from "../../../../../utils/fonts/NotoSansDevanagari"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export function useGenericTableManagement(data, title, searchFields = []) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({})
  const [visibleColumns, setVisibleColumns] = useState({})

  // Apply search
  const filteredData = useMemo(() => {
    let result = [...data]

    // Apply search query
    if (searchQuery.trim() && searchFields.length > 0) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(item => 
        searchFields.some(field => {
          const value = item[field]
          return value && value.toString().toLowerCase().includes(query)
        })
      )
    }

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "") {
        result = result.filter(item => {
          const itemValue = item[key]
          if (typeof value === 'string') {
            return itemValue === value || itemValue?.toString().toLowerCase() === value.toLowerCase()
          }
          return itemValue === value
        })
      }
    })

    return result
  }, [data, searchQuery, filters, searchFields])

  const count = filteredData.length

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value => value !== "" && value !== null && value !== undefined).length
  }, [filters])

  const handleApplyFilters = () => {
    setIsFilterOpen(false)
  }

  const handleResetFilters = () => {
    setFilters({})
  }

  const handleExport = async (format) => {
    const filename = title.toLowerCase().replace(/\s+/g, "_")
    switch (format) {
      case "excel":
        exportToExcel(filteredData, filename)
        break
      case "pdf":
        await exportToPDF(filteredData, filename)
        break
      default:
        break
    }
  }

  const handleViewOrder = (order) => {
    setSelectedOrder(order)
    setIsViewOrderOpen(true)
  }

  const handlePrintOrder = async (order) => {
    try {
      // Dynamic import of jsPDF and autoTable for instant PDF download
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })
      
      doc.addFileToVFS("NotoSansDevanagari.ttf", NotoSansDevanagariBase64);
      doc.addFont("NotoSansDevanagari.ttf", "NotoSansDevanagari", "normal");
      doc.addFont("NotoSansDevanagari.ttf", "NotoSansDevanagari", "bold");
      doc.setFont("NotoSansDevanagari", "normal");

      // Add title
      doc.setFontSize(18)
      doc.setTextColor(30, 30, 30)
      doc.text('Order Invoice', 105, 20, { align: 'center' })
      
      // Order ID
      doc.setFontSize(12)
      doc.setTextColor(100, 100, 100)
      const orderId = order.orderId || order.id || order.subscriptionId || 'N/A'
      doc.text(`Order ID: ${orderId}`, 105, 28, { align: 'center' })
      
      // Date
      doc.setFontSize(10)
      const orderDate = order.date && order.time ? `${order.date}, ${order.time}` : (order.date || new Date().toLocaleDateString())
      doc.text(`Date: ${orderDate}`, 105, 34, { align: 'center' })
      
      let startY = 45
      
      const customerName = order.customerName || order.userName || order.originalOrder?.customerName || order.originalOrder?.userName || '';
      const customerPhone = order.customerPhone || order.userNumber || order.originalOrder?.customerPhone || order.originalOrder?.userNumber || '';
      
      // Customer Information
      if (customerName || customerPhone) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Customer Information', 14, startY)
        startY += 8
        
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        if (customerName) {
          doc.text(`Name: ${customerName}`, 14, startY)
          startY += 6
        }
        if (customerPhone) {
          doc.text(`Phone: ${customerPhone}`, 14, startY)
          startY += 6
        }
        startY += 5
      }
      
      // Restaurant Information
      const restaurantName = order.restaurant || order.restaurantName || order.originalOrder?.restaurant || order.originalOrder?.restaurantName || '';
      if (restaurantName) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Restaurant', 14, startY)
        startY += 8
        
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        doc.text(restaurantName, 14, startY)
        startY += 10
      }
      
      // Order Items Table
      const items = order.items || order.originalOrder?.items || order.originalOrder?.pricing?.items || [];
      if (Array.isArray(items) && items.length > 0) {
        const tableData = items.map((item) => [
          item.quantity || 1,
          item.name || item.itemName || item.title || 'Unknown Item',
          `Rs. ${(item.price || 0).toFixed(2)}`,
          `Rs. ${((item.quantity || 1) * (item.price || 0)).toFixed(2)}`
        ])
        
        autoTable(doc, {
          startY: startY,
          head: [['Qty', 'Item Name', 'Price', 'Total']],
          body: tableData,
          theme: 'striped',
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 10,
            font: "NotoSansDevanagari"
          },
          bodyStyles: {
            fontSize: 9,
            textColor: [30, 30, 30]
          },
          alternateRowStyles: {
            fillColor: [245, 247, 250]
          },
          styles: {
            cellPadding: 4,
            lineColor: [200, 200, 200],
            lineWidth: 0.5
          },
          columnStyles: {
            0: { cellWidth: 20, halign: 'center' },
            1: { cellWidth: 80 },
            2: { cellWidth: 35, halign: 'right' },
            3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
          },
          margin: { left: 14, right: 14 }
        })
        
        startY = doc.lastAutoTable.finalY + 10
      }
      
      // Total Amount
      const totalAmountVal = order.totalAmount ?? order.total ?? order.pricing?.total ?? order.originalOrder?.totalAmount ?? order.originalOrder?.pricing?.total;
      if (totalAmountVal !== undefined && totalAmountVal !== null) {
        doc.setFontSize(14)
        doc.setTextColor(30, 30, 30)
        doc.setFont(undefined, 'bold')
        const totalAmountStr = typeof totalAmountVal === 'number' ? totalAmountVal.toFixed(2) : parseFloat(totalAmountVal || 0).toFixed(2)
        doc.text(`Total Amount: Rs. ${totalAmountStr}`, 14, startY)
        startY += 8
      }
      
      // Payment Status
      const paymentStatus = order.paymentStatus || order.payment?.status || order.originalOrder?.paymentStatus || order.originalOrder?.payment?.status || '';
      if (paymentStatus) {
        doc.setFontSize(10)
        doc.setTextColor(100, 100, 100)
        doc.setFont(undefined, 'normal')
        doc.text(`Payment Status: ${paymentStatus}`, 14, startY)
        startY += 6
      }
      
      // Order Status
      const orderStatus = order.orderStatus || order.status || order.originalOrder?.orderStatus || order.originalOrder?.status || '';
      if (orderStatus) {
        doc.setFontSize(10)
        doc.text(`Order Status: ${orderStatus}`, 14, startY)
      }
      
      // Save the PDF instantly
      const filename = `Invoice_${orderId}_${new Date().toISOString().split("T")[0]}.pdf`
      doc.save(filename)
    } catch (error) {
      debugError("Error generating PDF invoice:", error)
      alert("Failed to download PDF invoice. Please try again.")
    }
  }

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }

  const resetColumns = (defaultColumns) => {
    setVisibleColumns(defaultColumns || {})
  }

  return {
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    filters,
    setFilters,
    visibleColumns,
    filteredData,
    count,
    activeFiltersCount,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  }
}

