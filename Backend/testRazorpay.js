import { createRazorpayOrder } from './src/modules/food/orders/helpers/razorpay.helper.js';

async function test() {
    try {
        const order = await createRazorpayOrder(1000, "INR", "test_order_123");
        console.log("Success:", order);
    } catch (err) {
        console.error("Razorpay error:", err);
        console.log("Error message:", err?.message);
    }
}
test();
