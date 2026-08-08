import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// Export utility functions for reports
export const exportReportsToCSV = (data, headers, filename = "report") => {
  const rows = data.map((item, index) => {
    return headers.map(header => {
      const value = item[header.key] || item[header] || ""
      return typeof value === 'object' ? JSON.stringify(value) : value
    })
  })
  
  const headerRow = headers.map(h => typeof h === 'string' ? h : h.label).join(",")
  const csvContent = [
    headerRow,
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
  ].join("\n")
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportReportsToExcel = (data, headers, filename = "report") => {
  const rows = data.map((item) => {
    return headers.map(header => {
      const value = item[header.key] || item[header] || ""
      return typeof value === 'object' ? JSON.stringify(value) : value
    })
  })
  
  const headerRow = headers.map(h => typeof h === 'string' ? h : h.label).join("\t")
  const csvContent = [
    headerRow,
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

const sanitizePdfValue = (val) => {
  if (val === null || val === undefined) return ""
  let str = typeof val === "object" ? JSON.stringify(val) : String(val)
  return str
    .replace(/[\u20B9₹â¹¹]+/g, "Rs. ")
    .replace(/Rs\.\s*Rs\./g, "Rs.")
    .replace(/\s+/g, " ")
    .trim()
}

export const exportReportsToPDF = (data, headers, filename = "report", title = "Report") => {
  try {
    const doc = new jsPDF()

    // Title
    doc.setFontSize(18)
    doc.setFont("helvetica", "bold")
    doc.text(title, doc.internal.pageSize.getWidth() / 2, 20, { align: "center" })

    // Generated date
    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30)

    // Table headers
    const headerRow = headers.map(h => typeof h === "string" ? h : h.label)

    // Table body
    const bodyRows = data.map((item, index) => {
      return headers.map(header => {
        const key = typeof header === "string" ? header : (header.key || header.label)
        const value = key === "sl" || key === "SI" ? (item.sl || item.SI || index + 1) : (item[key] !== undefined && item[key] !== null ? item[key] : (item[header] || ""))
        return sanitizePdfValue(value)
      })
    })

    autoTable(doc, {
      head: [headerRow],
      body: bodyRows,
      startY: 36,
      theme: "grid",
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      margin: { top: 36, left: 14, right: 14 },
    })

    doc.save(`${filename}_${new Date().toISOString().split("T")[0]}.pdf`)
  } catch (err) {
    console.error("PDF generation error:", err)
  }
}

export const exportReportsToJSON = (data, filename = "report") => {
  const jsonContent = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonContent], { type: "application/json" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.json`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Specific export functions for Transaction Report
export const exportTransactionReportToCSV = (transactions, filename = "transaction_report") => {
  const headers = ["SI", "Order ID", "Restaurant", "Customer Name", "Total Item Amount", "Coupon Discount", "VAT/Tax", "Delivery Charge", "Platform Fee", "Order Amount"]
  const rows = transactions.map((transaction, index) => [
    index + 1,
    transaction.orderId,
    transaction.restaurant,
    transaction.customerName,
    `Rs. ${transaction.totalItemAmount.toFixed(2)}`,
    `Rs. ${transaction.couponDiscount.toFixed(2)}`,
    `Rs. ${transaction.vatTax.toFixed(2)}`,
    `Rs. ${transaction.deliveryCharge.toFixed(2)}`,
    `Rs. ${Number(transaction.platformFee || 0).toFixed(2)}`,
    `Rs. ${transaction.orderAmount.toFixed(2)}`
  ])
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n")
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportTransactionReportToExcel = (transactions, filename = "transaction_report") => {
  const headers = ["SI", "Order ID", "Restaurant", "Customer Name", "Total Item Amount", "Coupon Discount", "VAT/Tax", "Delivery Charge", "Platform Fee", "Order Amount"]
  const rows = transactions.map((transaction, index) => [
    index + 1,
    transaction.orderId,
    transaction.restaurant,
    transaction.customerName,
    `Rs. ${transaction.totalItemAmount.toFixed(2)}`,
    `Rs. ${transaction.couponDiscount.toFixed(2)}`,
    `Rs. ${transaction.vatTax.toFixed(2)}`,
    `Rs. ${transaction.deliveryCharge.toFixed(2)}`,
    `Rs. ${Number(transaction.platformFee || 0).toFixed(2)}`,
    `Rs. ${transaction.orderAmount.toFixed(2)}`
  ])
  
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

export const exportTransactionReportToPDF = (transactions, filename = "transaction_report") => {
  try {
    const doc = new jsPDF()

    doc.setFontSize(18)
    doc.setFont("helvetica", "bold")
    doc.text("Transaction Report", doc.internal.pageSize.getWidth() / 2, 20, { align: "center" })

    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30)

    const headers = ["SI", "Order ID", "Restaurant", "Customer Name", "Total Item Amount", "Coupon Discount", "VAT/Tax", "Delivery Charge", "Platform Fee", "Order Amount"]
    const rows = transactions.map((t, index) => [
      index + 1,
      t.orderId || "",
      t.restaurant || "",
      t.customerName || "",
      `Rs. ${(t.totalItemAmount || 0).toFixed(2)}`,
      `Rs. ${(t.couponDiscount || 0).toFixed(2)}`,
      `Rs. ${(t.vatTax || 0).toFixed(2)}`,
      `Rs. ${(t.deliveryCharge || 0).toFixed(2)}`,
      `Rs. ${Number(t.platformFee || 0).toFixed(2)}`,
      `Rs. ${(t.orderAmount || 0).toFixed(2)}`
    ])

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 36,
      theme: "grid",
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 7,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      margin: { top: 36, left: 14, right: 14 },
    })

    doc.save(`${filename}_${new Date().toISOString().split("T")[0]}.pdf`)
  } catch (err) {
    console.error("Transaction PDF generation error:", err)
  }
}

export const exportTransactionReportToJSON = (transactions, filename = "transaction_report") => {
  const jsonContent = JSON.stringify(transactions, null, 2)
  const blob = new Blob([jsonContent], { type: "application/json" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.json`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
