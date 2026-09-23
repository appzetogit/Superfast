const fs = require('fs');
const code = fs.readFileSync('c:/Users/Abcom/Desktop/AppzetoProjects/OyeChotuu/Frontend/src/modules/Food/pages/restaurant/OrdersMain.jsx', 'utf8');

let newCode = code.replace(
  code.substring(code.indexOf('  // New order popup states'), code.indexOf('  const [restaurantStatus, setRestaurantStatus] = useState({')),
  ''
);

newCode = newCode.replace(
  code.substring(code.indexOf('  // Timer persistence helpers'), code.indexOf('  const [hasStartedPolling, setHasStartedPolling] = useState(false);')),
  ''
);

newCode = newCode.replace(
  code.substring(code.indexOf('  // Restaurant notifications hook for real-time orders'), code.indexOf('  // Fetch restaurant status')),
  ''
);

newCode = newCode.replace(
  code.substring(code.indexOf('  // Show new order popup when real order notification arrives from Socket.IO'), code.indexOf('  // Handle cancel order (for preparing orders)')),
  `  // Listen for global orders refresh event
  useEffect(() => {
    const handleRefresh = () => requestOrdersRefresh();
    window.addEventListener('ordersRefresh', handleRefresh);
    return () => window.removeEventListener('ordersRefresh', handleRefresh);
  }, []);

`
);

newCode = newCode.replace(
  code.substring(code.indexOf('  // Toggle mute'), code.indexOf('  // Handle swipe gestures with smooth animations')),
  ''
);

newCode = newCode.replace(
  code.substring(code.indexOf('  const currentPopupOrder = popupOrder || newOrder;'), code.indexOf('  return (')),
  ''
);

newCode = newCode.replace(
  code.substring(code.indexOf('      <audio'), code.indexOf('      {/* Cancel Order Popup */}')),
  ''
);

fs.writeFileSync('c:/Users/Abcom/Desktop/AppzetoProjects/OyeChotuu/Frontend/src/modules/Food/pages/restaurant/OrdersMain.jsx', newCode);
console.log('Cleaned OrdersMain.jsx');
