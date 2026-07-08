const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'modules', 'food', 'orders', 'services', 'order.service.js');
let content = fs.readFileSync(filePath, 'utf8');

const helperFunc = `
export async function triggerInitialDispatchNotifications(order, orderStatus, from, io) {
  if (!io) return order;
  const isInitialDispatchTrigger = ((String(orderStatus) === "preparing" || String(orderStatus) === "confirmed") && (String(from) !== "preparing" && String(from) !== "confirmed"));
  if (!isInitialDispatchTrigger) return order;

  console.log(\`[DEBUG] Order \${order.orderId} status changed to '\${orderStatus}'. Triggering delivery dispatch.\`);
  
  if (order.dispatch?.status === "unassigned" && order.dispatch?.modeAtCreation === "auto") {
    try {
      console.log(\`[DEBUG] Auto-assigning order \${order.orderId}\`);
      await tryAutoAssign(order._id);
      order = await FoodOrder.findById(order._id);
    } catch (err) {
      console.error(\`[DEBUG] Auto-assign failed for order \${order.orderId}:\`, err);
    }
  }

  try {
    const restaurant = await FoodRestaurant.findById(order.restaurantId)
      .select("restaurantName location addressLine1 area city state")
      .lean();
    const payload = buildDeliverySocketPayload(order, restaurant);

    const assignedId = order.dispatch?.deliveryPartnerId?.toString?.() || order.dispatch?.deliveryPartnerId;
    if (order.dispatch?.status === "accepted") {
      console.log(\`[DEBUG] Order \${order.orderId} is already accepted. Skipping dispatch notifications.\`);
    } else if (assignedId && order.dispatch?.status === "assigned") {
      console.log(\`[DEBUG] Order \${order.orderId} status is 'assigned'. Notifying \${assignedId} only.\`);
      io.to(rooms.delivery(assignedId)).emit("new_order", payload);
      io.to(rooms.delivery(assignedId)).emit("play_notification_sound", {
        orderId: payload.orderId,
        orderMongoId: payload.orderMongoId,
      });
      await notifyOwnerSafely(
        { ownerType: "DELIVERY_PARTNER", ownerId: assignedId },
        {
          title: "New delivery task",
          body: \`Order \${payload.orderId} is assigned to you.\`,
          data: { type: "new_order", orderId: payload.orderId, orderMongoId: payload.orderMongoId, link: "/delivery" },
        }
      );
    } else {
      if (isSplitDispatchOrder(order)) {
        await notifySplitDispatchOffers(order, { restaurantDoc: restaurant });
      } else {
        console.log(\`[DEBUG] Searching for nearby partners for order \${order.orderId}\`);
        const { partners } = await listNearbyOnlineDeliveryPartners(order.restaurantId, { maxKm: 15, limit: 25 });
        console.log(\`[DEBUG] Found \${partners.length} partners: \${JSON.stringify(partners)}\`);
        
        for (const p of partners) {
          const targetRoom = rooms.delivery(p.partnerId);
          io.to(targetRoom).emit("new_order", { ...payload, pickupDistanceKm: p.distanceKm });
          io.to(targetRoom).emit("new_order_available", { ...payload, pickupDistanceKm: p.distanceKm });
        }
        
        await notifyOwnersSafely(
          partners.slice(0, 5).map((p) => ({ ownerType: "DELIVERY_PARTNER", ownerId: p.partnerId })),
          {
            title: "New delivery order available",
            body: \`Order \${payload.orderId} is available near \${restaurant?.restaurantName || "your area"}.\`,
            data: { type: "new_order_available", orderId: payload.orderId, orderMongoId: payload.orderMongoId, link: "/delivery" },
          }
        );
        
        for (const p of partners.slice(0, 5)) {
          io.to(rooms.delivery(p.partnerId)).emit("play_notification_sound", {
            orderId: payload.orderId,
            orderMongoId: payload.orderMongoId,
          });
        }
      }
    }
  } catch (err) {
    console.error(\`[DEBUG] Dispatch alert failed for order \${order.orderId}:\`, err);
  }
  
  return order;
}
`;

// 1. Insert helper function before updateOrderStatusRestaurant
content = content.replace('export async function updateOrderStatusRestaurant(', helperFunc + '\nexport async function updateOrderStatusRestaurant(');

// 2. Replace logic in updateOrderStatusRestaurant
const resRegex = /const isInitialDispatchTrigger = \(\(String\(orderStatus\) === "preparing" \|\| String\(orderStatus\) === "confirmed"\) && \(String\(from\) !== "preparing" && String\(from\) !== "confirmed"\)\);[\s\S]*?(?=\/\/ When ready for pickup -> ping assigned delivery partner\.)/;
if (resRegex.test(content)) {
  content = content.replace(resRegex, `order = await triggerInitialDispatchNotifications(order, orderStatus, from, io);\n\n      `);
  console.log('Replaced in updateOrderStatusRestaurant');
} else {
  console.log('Regex failed for updateOrderStatusRestaurant');
}

// 3. Replace logic in updateOrderStatusAdmin
const adminRegex = /\/\/ 4\. Driver Dispatch & Notifications\s+if \(orderStatus === "preparing" && from !== "preparing"\) \{[\s\S]*?(?=\s+if \(orderStatus === "ready_for_pickup" && order\.dispatch\?\.deliveryPartnerId\))/;
if (adminRegex.test(content)) {
  content = content.replace(adminRegex, `// 4. Driver Dispatch & Notifications\n  order = await triggerInitialDispatchNotifications(order, orderStatus, from, io);\n`);
  console.log('Replaced in updateOrderStatusAdmin');
} else {
  console.log('Regex failed for updateOrderStatusAdmin');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Modifications saved to order.service.js');
