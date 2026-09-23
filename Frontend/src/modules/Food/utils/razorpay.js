/**
 * Razorpay Payment Integration Utility
 * Handles Razorpay payment initialization and verification
 */

/*
let razorpayLoaded = false;

export const loadRazorpayScript = () => {
  return new Promise((resolve, reject) => {
    if (razorpayLoaded) {
      resolve();
      return;
    }

    if (window.Razorpay) {
      razorpayLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      razorpayLoaded = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Razorpay script'));
    };
    document.body.appendChild(script);
  });
};
*/

export const loadRazorpayScript = async () => {
  throw new Error('Online Razorpay payments are currently disabled.');
};

export const initRazorpayPayment = async (options) => {
  console.warn('Online Razorpay payments are disabled.');
  if (options?.onError) {
    options.onError(new Error('Online Razorpay payments are disabled.'));
  }
  throw new Error('Online Razorpay payments are currently disabled.');
  /*
  try {
    // Load Razorpay script if not already loaded
    await loadRazorpayScript();

    if (!window.Razorpay) {
      throw new Error('Razorpay SDK not available');
    }

    const razorpayOptions = {
      key: options.key,
      amount: options.amount,
      currency: options.currency || 'INR',
      order_id: options.order_id,
      name: options.name || 'Superfast Food',
      description: options.description || 'Order Payment',
      image: options.image || '/logo.png',
      prefill: {
        name: options.prefill?.name || '',
        email: options.prefill?.email || '',
        contact: options.prefill?.contact || ''
      },
      notes: options.notes || {},
      theme: {
        color: '#E23744'
      },
      handler: function(response) {
        if (options.handler) {
          options.handler(response);
        }
      },
      modal: {
        ondismiss: function() {
          if (options.onClose) {
            options.onClose();
          }
        },
        escape: true,
        animation: true
      },
      retry: {
        enabled: true,
        max_count: 3
      }
    };

    const razorpay = new window.Razorpay(razorpayOptions);
    
    razorpay.on('payment.failed', function(response) {
      console.error('Razorpay payment failed:', response);
      if (options.onError) {
        options.onError(response.error || { description: 'Payment failed. Please try again.' });
      }
    });

    razorpay.on('payment.method_selection_failed', function(response) {
      console.error('Razorpay payment method selection failed:', response);
      if (options.onError) {
        options.onError(response.error || { description: 'Please select another payment method.' });
      }
    });

    razorpay.open();
    return razorpay;
  } catch (error) {
    console.error('Error initializing Razorpay:', error);
    if (options.onError) {
      options.onError(error);
    }
    throw error;
  }
  */
};

/**
 * Format amount for display
 * @param {Number} amount - Amount in paise
 * @returns {String} Formatted amount string
 */
export const formatAmount = (amount) => {
  return `₹${(amount / 100).toFixed(2)}`;
};

