import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Printer, Volume2, VolumeX, ChevronDown, ChevronUp, Minus, Plus, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import notificationSound from '@food/assets/audio/alert.mp3';
import { restaurantAPI } from '@food/api';
import { useRestaurantNotifications } from '@food/hooks/useRestaurantNotifications';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

const getRestaurantVisibleItems = (items = []) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const foodItems = normalizedItems.filter((item) => {
    const itemType = String(item?.type || item?.orderType || 'food').toLowerCase();
    return itemType !== 'quick';
  });
  return foodItems.length ? foodItems : normalizedItems;
};

export default function GlobalNewOrderPopup() {
  // New order popup states
  const [showNewOrderPopup, setShowNewOrderPopup] = useState(false);
  const [popupOrder, setPopupOrder] = useState(null); // Store order for popup (from Socket.IO or API)
  const [isMuted, setIsMuted] = useState(false);
  const [prepTime, setPrepTime] = useState(11);
  const [countdown, setCountdown] = useState(240); // 4 minutes in seconds
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
  const [showRejectPopup, setShowRejectPopup] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [acceptSwipeProgress, setAcceptSwipeProgress] = useState(0);
  const [isAcceptingOrder, setIsAcceptingOrder] = useState(false);
  const audioRef = useRef(null);
  const shownOrdersRef = useRef(new Set()); // Track orders already shown in popup
  const acceptSliderRef = useRef(null);
  const acceptSwipeStartXRef = useRef(0);
  const acceptSwipeActiveRef = useRef(false);

  const showNewOrderPopupRef = useRef(false);
  const isMutedRef = useRef(false);
  const newOrderRef = useRef(null);
  const audioUnlockedRef = useRef(false);


  // Timer persistence helpers
  const getInitialCountdown = (orderId) => {
    if (!orderId) return 240;
    const storageKey = `order_timer_${orderId}`;
    const startTime = localStorage.getItem(storageKey);
    
    if (startTime) {
      const elapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000);
      const remaining = 240 - elapsed;
      return remaining > 0 ? remaining : 0;
    } else {
      localStorage.setItem(storageKey, Date.now().toString());
      return 240;
    }
  };

  const clearOrderTimer = (orderId) => {
    if (orderId) {
      localStorage.removeItem(`order_timer_${orderId}`);
    }
  };

  const markOrderAsShown = (orderLike) => {
    const keys = [
      orderLike?.orderMongoId,
      orderLike?.orderId,
      orderLike?._id,
      orderLike?.id,
    ]
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter(Boolean);

    for (const k of keys) shownOrdersRef.current.add(k);
  };

  const hasOrderBeenShown = (orderLike) => {
    const keys = [
      orderLike?.orderMongoId,
      orderLike?.orderId,
      orderLike?._id,
      orderLike?.id,
    ]
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter(Boolean);

    return keys.some((k) => shownOrdersRef.current.has(k));
  };

  const getPopupOrderTotal = (orderLike) => {
    if (!orderLike) return 0;

    const rawItems = Array.isArray(orderLike.items) ? orderLike.items : [];
    const visibleItems = getRestaurantVisibleItems(rawItems);
    const hasFilteredMixedItems = visibleItems.length > 0 && visibleItems.length !== rawItems.length;

    if (hasFilteredMixedItems) {
      const visibleItemsTotal = visibleItems.reduce((sum, item) => {
        const price = Number(item?.price || 0);
        const qty = Number(item?.quantity || 0);
        return sum + (Number.isFinite(price) ? price : 0) * (Number.isFinite(qty) ? qty : 0);
      }, 0);

      return Number.isFinite(visibleItemsTotal) ? visibleItemsTotal : 0;
    }

    const directTotal = Number(orderLike.total);
    if (Number.isFinite(directTotal) && directTotal > 0) return directTotal;

    const pricingTotal = Number(orderLike.pricing?.total);
    if (Number.isFinite(pricingTotal) && pricingTotal > 0) return pricingTotal;

    const amountDue = Number(orderLike.payment?.amountDue);
    if (Number.isFinite(amountDue) && amountDue > 0) return amountDue;

    const itemsTotal = visibleItems.reduce((sum, item) => {
      const price = Number(item?.price || 0);
      const qty = Number(item?.quantity || 0);
      return sum + (Number.isFinite(price) ? price : 0) * (Number.isFinite(qty) ? qty : 0);
    }, 0);

    return Number.isFinite(itemsTotal) ? itemsTotal : 0;
  };

  // Restaurant notifications hook for real-time orders
  const { newOrder, clearNewOrder, isConnected } = useRestaurantNotifications();

  const rejectReasons = [
    'Restaurant is too busy',
    'Item not available',
    'Outside delivery area',
    'Kitchen closing soon',
    'Technical issue',
    'Other reason',
  ];

  const requestOrdersRefresh = () => {
    // Dispatch a global event so any active order lists can refresh
    window.dispatchEvent(new Event('ordersRefresh'));
  };

  // Show new order popup when real order notification arrives from Socket.IO
  useEffect(() => {
    if (newOrder) {
      debugLog("?? New order received via Socket.IO:", newOrder);

      const scheduledAt = newOrder.scheduledAt
        ? new Date(newOrder.scheduledAt).getTime()
        : null;
      const isFutureScheduled =
        scheduledAt && scheduledAt > Date.now() + 15 * 60000;

      if (isFutureScheduled) {
        toast.info(
          `New scheduled order received for ${new Date(scheduledAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
        );
        requestOrdersRefresh();
        return; // Do not show the immediate popup
      }

      if (!hasOrderBeenShown(newOrder)) {
        markOrderAsShown(newOrder);
        setPopupOrder(newOrder);
        setShowNewOrderPopup(true);
        const orderId = newOrder.orderMongoId || newOrder.orderId || newOrder._id;
        setCountdown(getInitialCountdown(orderId));
        requestOrdersRefresh();
      }
    }
  }, [newOrder]);

  // Keep refs in sync to avoid stale state inside one-time event handlers.
  useEffect(() => {
    showNewOrderPopupRef.current = showNewOrderPopup;
  }, [showNewOrderPopup]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    newOrderRef.current = newOrder;
  }, [newOrder]);

  // Best-effort unlock for popup buzzer so it can keep playing when tab is backgrounded.
  useEffect(() => {
    const unlockAudio = async () => {
      if (audioUnlockedRef.current || !audioRef.current) return;
      try {
        audioRef.current.muted = true;
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioUnlockedRef.current = true;

        // If an order popup is already open, start buzzing immediately after unlock.
        if (showNewOrderPopupRef.current && !isMutedRef.current) {
          audioRef.current.loop = true;
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
      } catch (_) {
        audioRef.current.muted = false;
      }
    };

    window.addEventListener("pointerdown", unlockAudio, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);


  // Check for confirmed orders that haven't been shown in popup yet, or scheduled orders whose time has come
  useEffect(() => {
    const checkOrdersToPopup = async () => {
      // Skip if popup is already showing or Socket.IO order exists
      if (showNewOrderPopupRef.current || newOrderRef.current) return;

      try {
        const response = await restaurantAPI.getOrders();
        if (response.data?.success && response.data.data?.orders) {
          const now = Date.now();

          // Find orders that should trigger the popup
          const targetOrders = response.data.data.orders.filter((order) => {
            if (hasOrderBeenShown(order)) return false;

            const isConfirmed = order.status === "confirmed";
            const isCreatedScheduled =
              order.status === "created" && order.scheduledAt;

            if (isConfirmed && !order.scheduledAt) return true; // ordinary confirmed fallback

            if (
              order.scheduledAt &&
              (order.status === "created" || order.status === "confirmed")
            ) {
              const scheduledTime = new Date(order.scheduledAt).getTime();
              // Show popup if scheduled time is <= 15 mins from now
              if (scheduledTime <= now + 15 * 60000) return true;
            }

            return false;
          });

          // Show the most recent matching order in popup
          if (
            targetOrders.length > 0 &&
            !showNewOrderPopupRef.current &&
            !newOrderRef.current
          ) {
            const orderToPopup = targetOrders[0];
            const orderId = orderToPopup.orderId || orderToPopup._id;

            // Transform order to match newOrder format (include payment so COD shows correctly)
            const orderForPopup = {
              orderId: orderToPopup.orderId,
              orderMongoId: orderToPopup._id,
              restaurantId: orderToPopup.restaurantId,
              restaurantName: orderToPopup.restaurantName,
              items: getRestaurantVisibleItems(orderToPopup.items || []),
              total: orderToPopup.pricing?.total || 0,
              customerAddress: orderToPopup.address,
              status: orderToPopup.status,
              createdAt: orderToPopup.createdAt,
              scheduledAt: orderToPopup.scheduledAt,
              estimatedDeliveryTime: orderToPopup.estimatedDeliveryTime || 30,
              note: orderToPopup.note || "",
              sendCutlery: orderToPopup.sendCutlery,
              paymentMethod:
                orderToPopup.paymentMethod ||
                orderToPopup.payment?.method ||
                null,
              payment: orderToPopup.payment,
            };

            debugLog("?? Found order ready for popup:", orderForPopup);
            markOrderAsShown({ orderId, _id: orderToPopup._id });
            setPopupOrder(orderForPopup);
            setShowNewOrderPopup(true);
            setCountdown(getInitialCountdown(orderId));
          }
        }
      } catch (error) {
        if (error.response?.status !== 401) {
          debugError("Error checking orders to popup:", error);
        }
      }
    };

    // Check once on mount, and then every minute
    checkOrdersToPopup();
    const intervalId = setInterval(checkOrdersToPopup, 60000);

    return () => clearInterval(intervalId);
  }, []);

  // Play audio when popup opens
  useEffect(() => {
    if (showNewOrderPopup && !isMuted) {
      if (audioRef.current) {
        audioRef.current.loop = true;
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioRef.current.currentTime = 0;
        audioRef.current
          .play()
          .catch((err) => debugLog("Audio play failed:", err));
      }
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [showNewOrderPopup, isMuted]);

  // Countdown timer
  useEffect(() => {
    if (showNewOrderPopup) {
      if (countdown > 0) {
        const timer = setInterval(() => {
          setCountdown((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
      } else {
        // Automatically reject when countdown hits 0
        handleAutoReject();
      }
    }
  }, [showNewOrderPopup, countdown]);

  useEffect(() => {
    if (!showNewOrderPopup) {
      setAcceptSwipeProgress(0);
      setIsAcceptingOrder(false);
      acceptSwipeActiveRef.current = false;
      acceptSwipeStartXRef.current = 0;
    }
  }, [showNewOrderPopup]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (acceptSwipeActiveRef.current) {
        handleAcceptSwipeMove(event.clientX);
      }
    };

    const handleTouchMove = (event) => {
      if (acceptSwipeActiveRef.current && event.touches[0]) {
        // Prevent page scroll while swiping the slider
        if (typeof event.preventDefault === "function") event.preventDefault();
        handleAcceptSwipeMove(event.touches[0].clientX);
      }
    };

    const handlePointerEnd = () => {
      if (acceptSwipeActiveRef.current) {
        handleAcceptSwipeEnd();
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handlePointerEnd);
    // passive: false is required to allow preventDefault() during swipe
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handlePointerEnd);
    window.addEventListener("touchcancel", handlePointerEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handlePointerEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handlePointerEnd);
      window.removeEventListener("touchcancel", handlePointerEnd);
    };
  }, [isAcceptingOrder]);

  // Format countdown time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getAcceptSliderMetrics = () => {
    const sliderWidth = acceptSliderRef.current?.offsetWidth || 320;
    const handleWidth = 56;
    const horizontalPadding = 8;
    const maxTravel = Math.max(
      sliderWidth - handleWidth - horizontalPadding * 2,
      1,
    );
    return { maxTravel };
  };

  const triggerSwipeAccept = () => {
    if (isAcceptingOrder) return;
    setAcceptSwipeProgress(1);
    setTimeout(() => {
      handleAcceptOrder();
    }, 160);
  };

  const handleAcceptSwipeStart = (clientX) => {
    if (isAcceptingOrder) return;
    acceptSwipeStartXRef.current = clientX;
    acceptSwipeActiveRef.current = true;
  };

  const handleAcceptSwipeMove = (clientX) => {
    if (!acceptSwipeActiveRef.current || isAcceptingOrder) return;
    const deltaX = Math.max(clientX - acceptSwipeStartXRef.current, 0);
    const { maxTravel } = getAcceptSliderMetrics();
    setAcceptSwipeProgress(Math.min(deltaX / maxTravel, 1));
  };

  const handleAcceptSwipeEnd = () => {
    if (!acceptSwipeActiveRef.current || isAcceptingOrder) return;
    acceptSwipeActiveRef.current = false;

    if (acceptSwipeProgress >= 0.45) {
      triggerSwipeAccept();
      return;
    }

    setAcceptSwipeProgress(0);
  };

  // Handle auto reject on timeout
  const handleAutoReject = async () => {
    const orderToReject = popupOrder || newOrder;
    if (!orderToReject) return;

    const orderId = orderToReject.orderMongoId || orderToReject.orderId || orderToReject?._id;
    if (!orderId) return;

    try {
      // Use a special reason for auto-rejection
      await restaurantAPI.rejectOrder(orderId, "Order timeout - No response from restaurant");
      toast.info("Order auto-rejected due to timeout");
      clearOrderTimer(orderId);
      requestOrdersRefresh();
    } catch (error) {
      debugError("Error auto-rejecting order:", error);
    } finally {
      // Clean up UI state regardless of API success
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setShowRejectPopup(false);
      setShowNewOrderPopup(false);
      setPopupOrder(null);
      clearNewOrder();
      setRejectReason("");
      setCountdown(240);
      setPrepTime(11);
      setAcceptSwipeProgress(0);
      setIsAcceptingOrder(false);
    }
  };

  // Handle accept order
  const handleAcceptOrder = async () => {
    if (isAcceptingOrder) return;
    setIsAcceptingOrder(true);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Use popupOrder (from Socket.IO or API fallback) or newOrder (from hook)
    const orderToAccept = popupOrder || newOrder;

    // Ensure this order can't re-trigger fallback popup by using a different id key.
    markOrderAsShown(orderToAccept);

    // Accept order via API if we have a real order
    if (orderToAccept?.orderMongoId || orderToAccept?.orderId) {
      try {
        const orderId = orderToAccept.orderMongoId || orderToAccept.orderId;
        const response = await restaurantAPI.acceptOrder(orderId, prepTime);
        debugLog("? Order accepted:", orderId);
        toast.success("Order accepted successfully");
        requestOrdersRefresh();
      } catch (error) {
        debugError("? Error accepting order:", error);
        const errorMessage =
          error.response?.data?.message ||
          error.message ||
          "Failed to accept order. Please try again.";

        // Show specific error message
        if (error.response?.status === 400) {
          toast.error(errorMessage);
        } else if (error.response?.status === 404) {
          toast.error(
            "Order not found. It may have been cancelled or already processed.",
          );
        } else {
          toast.error(errorMessage);
        }
        setIsAcceptingOrder(false);
        setAcceptSwipeProgress(0);
        return;
      }
    }

    const orderId = orderToAccept?.orderMongoId || orderToAccept?.orderId || orderToAccept?._id;
    clearOrderTimer(orderId);
    
    setShowNewOrderPopup(false);
    setPopupOrder(null);
    clearNewOrder();
    setCountdown(240);
    setPrepTime(11);
    setAcceptSwipeProgress(0);
    setIsAcceptingOrder(false);

    // Note: PreparingOrders component will automatically refresh orders via its own useEffect
    // No need to manually refresh here as the component polls every 10 seconds
  };

  // Handle reject order
  const handleRejectClick = () => {
    setShowRejectPopup(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason) return;

    // Use popupOrder (from Socket.IO or API fallback) or newOrder (from hook)
    const orderToReject = popupOrder || newOrder;

    // Reject order via API if we have a real order
    if (orderToReject?.orderMongoId || orderToReject?.orderId) {
      try {
        const orderId = orderToReject.orderMongoId || orderToReject.orderId;
        await restaurantAPI.rejectOrder(orderId, rejectReason);
        debugLog("? Order rejected:", orderId);
        requestOrdersRefresh();
      } catch (error) {
        debugError("? Error rejecting order:", error);
        alert("Failed to reject order. Please try again.");
        return;
      }
    }

    const orderId = orderToReject?.orderMongoId || orderToReject?.orderId || orderToReject?._id;
    clearOrderTimer(orderId);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setShowRejectPopup(false);
    setShowNewOrderPopup(false);
    setPopupOrder(null);
    clearNewOrder();
    setRejectReason("");
    setCountdown(240);
    setPrepTime(11);
  };

  const handleRejectCancel = () => {
    setShowRejectPopup(false);
    setShowNewOrderPopup(false);
    setPopupOrder(null);
    clearNewOrder();
    setRejectReason("");
    setCountdown(240);
  };

  // Toggle mute
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      if (!isMuted) {
        audioRef.current.pause();
      } else {
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioRef.current.currentTime = 0;
        audioRef.current
          .play()
          .catch((err) => debugLog("Audio play failed:", err));
      }
    }
  };

  // Handle PDF download
  const handlePrint = async () => {
    const baseOrder = currentPopupOrder;
    if (!baseOrder) {
      debugWarn("No order data available for PDF generation");
      return;
    }

    try {
      // Fetch full order details to ensure we have customer name and full items
      let orderToPrint = baseOrder;
      try {
        const res = await restaurantAPI.getOrderById(baseOrder.orderId || baseOrder._id || baseOrder.mongoId);
        if (res?.data?.success && res.data.data?.order) {
          orderToPrint = res.data.data.order;
        } else if (res?.data?.order) {
          orderToPrint = res.data.order;
        }
      } catch (err) {
        debugWarn("Failed to fetch full order for PDF, using base order", err);
      }

      // Create new PDF document
      const doc = new jsPDF();

      // Set font
      doc.setFont("helvetica", "bold");

      // Header
      doc.setFontSize(20);
      doc.text("Order Receipt", 105, 20, { align: "center" });

      // Restaurant name
      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text(orderToPrint.restaurantName || "Restaurant", 105, 30, {
        align: "center",
      });

      // Order details
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`Order ID: ${orderToPrint.orderId || "N/A"}`, 20, 45);
      doc.setFont("helvetica", "normal");

      const orderDate = orderToPrint.createdAt
        ? new Date(orderToPrint.createdAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : new Date().toLocaleString("en-GB");

      doc.text(`Date: ${orderDate}`, 20, 52);

      // Customer Name
      const customerName = orderToPrint.userId?.name || orderToPrint.user?.name || orderToPrint.customerName || orderToPrint.userName || "Customer";
      doc.setFont("helvetica", "bold");
      doc.text("Customer Name:", 20, 59);
      doc.setFont("helvetica", "normal");
      doc.text(customerName, 60, 59);

      // Customer address
      const deliveryAddress = orderToPrint.deliveryAddress || orderToPrint.address || orderToPrint.customerAddress;
      let yPos = 66;
      if (deliveryAddress) {
        doc.setFont("helvetica", "bold");
        doc.text("Delivery Address:", 20, yPos);
        doc.setFont("helvetica", "normal");
        const addressText =
          deliveryAddress.formattedAddress ||
          [
            deliveryAddress.street,
            deliveryAddress.additionalDetails,
            deliveryAddress.city,
            deliveryAddress.state,
            deliveryAddress.zipCode
          ]
            .filter(Boolean)
            .join(", ") || "Address not available";
        const addressLines = doc.splitTextToSize(addressText, 130);
        doc.text(addressLines, 60, yPos);
        yPos += addressLines.length * 7;
      }
      yPos += 5; // spacing before items table

      // Items table
      const printableItems = getRestaurantVisibleItems(orderToPrint.items);
      if (printableItems.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.text("Items:", 20, yPos);
        yPos += 8;

        // Prepare table data
        const tableData = printableItems.map((item) => {
          const itemName = item.name || item.foodName || item.productName || "Item";
          const finalName = item.variantName ? `${itemName} (${item.variantName})` : itemName;
          const qty = item.quantity || item.qty || 1;
          const price = Number(item.price || 0);
          return [
            finalName,
            String(qty),
            `Rs. ${price.toFixed(2)}`,
            `Rs. ${(price * qty).toFixed(2)}`,
          ];
        });

        autoTable(doc, {
          startY: yPos,
          head: [["Item", "Qty", "Price", "Total"]],
          body: tableData,
          theme: "striped",
          headStyles: {
            fillColor: [0, 0, 0],
            textColor: 255,
            fontStyle: "bold",
          },
          styles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 30, halign: "center" },
            2: { cellWidth: 35, halign: "right" },
            3: { cellWidth: 35, halign: "right" },
          },
        });

        yPos = doc.lastAutoTable.finalY + 10;
      }

      // Total
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      const totalAmount = orderToPrint.pricing?.total || orderToPrint.total || 0;
      doc.text(`Total: Rs. ${Number(totalAmount).toFixed(2)}`, 20, yPos);

      // Payment status
      yPos += 10;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Payment Status: ${orderToPrint.status === "confirmed" ? "Paid" : "Pending"}`,
        20,
        yPos,
      );

      // Estimated delivery time
      if (orderToPrint.estimatedDeliveryTime) {
        yPos += 8;
        doc.text(
          `Estimated Delivery: ${orderToPrint.estimatedDeliveryTime} minutes`,
          20,
          yPos,
        );
      }

      // Notes
      if (orderToPrint.note) {
        yPos += 10;
        doc.setFont("helvetica", "bold");
        doc.text("Note:", 20, yPos);
        doc.setFont("helvetica", "normal");
        const noteLines = doc.splitTextToSize(orderToPrint.note, 170);
        doc.text(noteLines, 20, yPos + 7);
      }

      // Cutlery preference
      yPos += 15;
      doc.setFont("helvetica", "normal");
      doc.text(
        orderToPrint.sendCutlery === false
          ? "? Don't send cutlery"
          : "? Send cutlery requested",
        20,
        yPos,
      );

      // Footer
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text(
        `Generated on ${new Date().toLocaleString("en-GB")}`,
        105,
        pageHeight - 10,
        { align: "center" },
      );

      // Download PDF
      const fileName = `Order-${orderToPrint.orderId || "Receipt"}-${Date.now()}.pdf`;
      doc.save(fileName);

      debugLog("? PDF generated successfully:", fileName);
    } catch (error) {
      debugError("? Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };


  const currentPopupOrder = popupOrder || newOrder;
  const popupVisibleItems = getRestaurantVisibleItems(currentPopupOrder?.items);
  const popupPrimaryItem = popupVisibleItems[0] || null;

  return (
    <>
      <audio
        ref={audioRef}
        src={notificationSound}
        preload="auto"
        playsInline
      />
      {/* New Order Popup */}
      <AnimatePresence>
        {showNewOrderPopup && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}>
              <motion.div
                className="w-[95%] max-w-md max-h-[calc(100vh-2rem)] bg-white rounded-[2rem] shadow-2xl overflow-hidden p-1 flex flex-col"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-gray-900">
                      {currentPopupOrder?.orderId || "#Order"}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {currentPopupOrder?.restaurantName || "Restaurant"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrint}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label="Print">
                      <Printer className="w-5 h-5 text-gray-700" />
                    </button>
                    <button
                      onClick={toggleMute}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label={isMuted ? "Unmute" : "Mute"}>
                      {isMuted ? (
                        <VolumeX className="w-5 h-5 text-gray-700" />
                      ) : (
                        <Volume2 className="w-5 h-5 text-gray-700" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="px-4 pt-4 pb-4 flex-1 overflow-y-auto min-h-0">
                  {/* Scheduled Indicator */}
                  {currentPopupOrder?.scheduledAt && (
                    <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-[#49AB14] uppercase tracking-wider">
                          Scheduled Order
                        </p>
                        <p className="text-sm font-semibold text-[#49AB14] mt-0.5">
                          For{" "}
                          {new Date(
                            currentPopupOrder.scheduledAt,
                          ).toLocaleString("en-US", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Customer info */}
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {popupPrimaryItem?.name || "New Order"}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {currentPopupOrder?.createdAt
                        ? new Date(
                            currentPopupOrder.createdAt,
                          ).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Just now"}
                    </p>
                  </div>

                  {/* Details Accordion */}
                  <div className="mb-4">
                    <button
                      onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                      className="w-full flex items-center justify-between py-2 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <svg
                          className="w-5 h-5 text-gray-700"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <span className="text-sm font-semibold text-gray-900">
                          Details
                        </span>
                        <span className="text-xs text-gray-500">
                          {popupVisibleItems.length || 0} item
                          {popupVisibleItems.length !== 1
                            ? "s"
                            : ""}
                        </span>
                      </div>
                      {isDetailsExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-600" />
                      )}
                    </button>

                    <AnimatePresence>
                      {isDetailsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden">
                          <div className="py-3 space-y-3">
                            {popupVisibleItems.length > 0 ? popupVisibleItems.map(
                              (item, index) => (
                                <div
                                  key={index}
                                  className="flex items-start gap-3">
                                  <div
                                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.isVeg ? "bg-green-500" : "bg-red-500"}`}></div>
                                  <div className="flex-1">
                                    <div className="flex items-start justify-between">
                                      <p className="text-sm font-medium text-gray-900">
                                        {item.quantity} x {item.name}
                                      </p>
                                      <p className="text-xs text-gray-600 ml-2">
                                        ₹{item.price * item.quantity}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ),
                            ) : (
                              <p className="text-sm text-gray-500">No items</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Cutlery preference */}
                  <div
                    className={`mb-4 flex items-center gap-2 rounded-lg p-3 ${(popupOrder || newOrder)?.sendCutlery === false
                        ? "bg-orange-50"
                        : "bg-gray-50"
                      }`}>
                    <svg
                      className={`h-5 w-5 ${(popupOrder || newOrder)?.sendCutlery === false
                          ? "text-[var(--primary-theme)]"
                          : "text-gray-600"
                        }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <span
                      className={`text-sm font-medium ${(popupOrder || newOrder)?.sendCutlery === false
                          ? "text-orange-700"
                          : "text-gray-700"
                        }`}>
                      {(popupOrder || newOrder)?.sendCutlery === false
                        ? "Don't send cutlery"
                        : "Send cutlery"}
                    </span>
                  </div>

                  {/* Total bill */}
                  <div className="mb-4 flex items-center justify-between py-3 border-y border-gray-200">
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-5 h-5 text-gray-700"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
                        />
                      </svg>
                      <span className="text-sm font-semibold text-gray-900">
                        Total bill
                      </span>
                    </div>
                    <span className="text-base font-bold text-gray-900">
                      ₹{getPopupOrderTotal(popupOrder || newOrder)}
                    </span>
                  </div>

                  {/* Payment method: treat cash/cod (any case) as COD */}
                  {(() => {
                    const raw =
                      (popupOrder || newOrder)?.paymentMethod ||
                      (popupOrder || newOrder)?.payment?.method;
                    const m =
                      raw != null ? String(raw).toLowerCase().trim() : "";
                    const isCod = m === "cash" || m === "cod";
                    return (
                      <div className="mb-4 flex items-center justify-between py-2">
                        <span className="text-sm font-medium text-gray-700">
                          Payment
                        </span>
                        <span
                          className={`text-sm font-semibold ${isCod ? "text-amber-600" : "text-green-600"}`}>
                          {isCod ? "Cash on Delivery" : "Online"}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Preparation time */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">
                        Preparation time
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPrepTime(Math.max(1, prepTime - 1))}
                          className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
                          <Minus className="w-4 h-4 text-gray-700" />
                        </button>
                        <span className="text-base font-semibold text-gray-900 min-w-[60px] text-center">
                          {prepTime} mins
                        </span>
                        <button
                          onClick={() => setPrepTime(prepTime + 1)}
                          className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
                          <Plus className="w-4 h-4 text-gray-700" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 pt-3 border-t border-gray-200 bg-white">
                  <div className="space-y-3">
                    <div
                      ref={acceptSliderRef}
                      className="relative h-14 rounded-2xl bg-gray-900 overflow-hidden select-none touch-pan-y">
                      <motion.div
                        className="absolute inset-y-0 left-0 bg-blue-600"
                        initial={{ width: "100%" }}
                        animate={{ width: `${(countdown / 240) * 100}%` }}
                        transition={{ duration: 1, ease: "linear" }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center px-16">
                        <span className="relative z-10 text-sm font-semibold text-white text-center">
                          {isAcceptingOrder
                            ? "Accepting order..."
                            : `Slide to accept (${formatTime(countdown)})`}
                        </span>
                      </div>
                      <motion.button
                        type="button"
                        className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-white text-gray-900 shadow-md disabled:cursor-not-allowed"
                        style={{
                          x: (() => {
                            const sliderWidth =
                              acceptSliderRef.current?.offsetWidth || 320;
                            const handleWidth = 40;
                            const maxTravel = Math.max(
                              sliderWidth - handleWidth - 16,
                              0,
                            );
                            return acceptSwipeProgress * maxTravel;
                          })(),
                        }}
                        onMouseDown={(e) => handleAcceptSwipeStart(e.clientX)}
                        onTouchStart={(e) =>
                          handleAcceptSwipeStart(e.touches[0].clientX)
                        }
                        onMouseMove={(e) => {
                          if (acceptSwipeActiveRef.current)
                            handleAcceptSwipeMove(e.clientX);
                        }}
                        onTouchMove={(e) =>
                          handleAcceptSwipeMove(e.touches[0].clientX)
                        }
                        onMouseUp={handleAcceptSwipeEnd}
                        onTouchEnd={handleAcceptSwipeEnd}
                        onTouchCancel={handleAcceptSwipeEnd}
                        disabled={isAcceptingOrder}>
                        <span className="text-lg font-bold">›</span>
                      </motion.button>
                    </div>

                    <button
                      onClick={handleRejectClick}
                      disabled={isAcceptingOrder}
                      className="w-full bg-white border-2 border-red-500 text-red-600 py-3 rounded-lg font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-60">
                      Reject Order
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Reject Order Popup */}
      <AnimatePresence>
        {showRejectPopup && (
          <>
            <motion.div
              className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleRejectCancel}>
              <motion.div
                className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-4 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">
                    Reject Order {(popupOrder || newOrder)?.orderId || "#Order"}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Please select a reason for rejecting this order
                  </p>
                </div>

                {/* Content */}
                <div className="px-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="space-y-2">
                    {rejectReasons.map((reason) => (
                      <button
                        key={reason}
                        onClick={() => setRejectReason(reason)}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                          rejectReason === reason
                            ? "border-black bg-black/5"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}>
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm font-medium ${
                              rejectReason === reason
                                ? "text-black"
                                : "text-gray-900"
                            }`}>
                            {reason}
                          </span>
                          {rejectReason === reason && (
                            <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                  <button
                    onClick={handleRejectCancel}
                    className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleRejectConfirm}
                    disabled={!rejectReason}
                    className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${
                      rejectReason
                        ? "!bg-black !text-white"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}>
                    Confirm Rejection
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>


    </>
  );
}
