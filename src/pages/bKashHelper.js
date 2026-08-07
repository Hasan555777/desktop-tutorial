// src/pages/bKashHelper.js

// ============================================================
// 🔥 bKash API Configuration
// ============================================================
const BKASH_CONFIG = {
  // স্যান্ডবক্স (টেস্টিং)
  sandbox: {
    baseURL: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized',
    appKey: import.meta.env.VITE_BKASH_APP_KEY || '5tunt4masn6pv2hnvte1sb5ndm',
    appSecret: import.meta.env.VITE_BKASH_APP_SECRET || '1uc1cs132p7aqm9o98bmj3jjb571gbm6g5tb9m3s0o19tl3sp1ef8gid6a0qadr37qolagbc49qvtv9j30pcpfa04l7arqv65v6l52f8s9ptolc7s9k9n3p0p7n4s5n8',
    username: import.meta.env.VITE_BKASH_USERNAME || 'sandboxTestUser',
    password: import.meta.env.VITE_BKASH_PASSWORD || 'sandboxTestPassword'
  },
  // লাইভ (প্রোডাকশন)
  live: {
    baseURL: 'https://tokenized.bka.sh/v1.2.0-beta/tokenized',
    appKey: import.meta.env.VITE_BKASH_LIVE_APP_KEY,
    appSecret: import.meta.env.VITE_BKASH_LIVE_APP_SECRET,
    username: import.meta.env.VITE_BKASH_LIVE_USERNAME,
    password: import.meta.env.VITE_BKASH_LIVE_PASSWORD
  }
};

const isSandbox = import.meta.env.VITE_BKASH_SANDBOX === 'true';
const config = isSandbox ? BKASH_CONFIG.sandbox : BKASH_CONFIG.live;

let authToken = null;
let tokenExpiry = null;

// ============================================================
// ✅ ১. টোকেন জেনারেট
// ============================================================
export const generateToken = async () => {
  // টোকেন আছে এবং মেয়াদ শেষ হয়নি
  if (authToken && tokenExpiry && tokenExpiry > Date.now()) {
    return authToken;
  }

  try {
    const response = await fetch(`${config.baseURL}/checkout/token/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        app_key: config.appKey,
        app_secret: config.appSecret
      })
    });

    const data = await response.json();

    if (data.statusCode === '0000' && data.id_token) {
      authToken = data.id_token;
      tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
      return authToken;
    } else {
      throw new Error(data.statusMessage || 'Failed to generate token');
    }
  } catch (error) {
    console.error('Token generation error:', error);
    throw error;
  }
};

// ============================================================
// ✅ ২. পেমেন্ট তৈরি (Create Payment)
// ============================================================
export const createPayment = async (amount, orderId, reference) => {
  try {
    const token = await generateToken();

    const response = await fetch(`${config.baseURL}/checkout/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'X-APP-Key': config.appKey
      },
      body: JSON.stringify({
        mode: '0011',
        payerReference: reference || orderId,
        callbackURL: `${window.location.origin}/payment/callback`,
        amount: amount.toString(),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: `INV-${Date.now()}`
      })
    });

    const data = await response.json();

    if (data.statusCode === '0000') {
      return {
        success: true,
        paymentID: data.paymentID,
        bkashURL: data.bkashURL,
        merchantInvoiceNumber: data.merchantInvoiceNumber
      };
    } else {
      return {
        success: false,
        error: data.statusMessage || 'Payment creation failed'
      };
    }
  } catch (error) {
    console.error('Create payment error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// ============================================================
// ✅ ৩. পেমেন্ট এক্সিকিউট (Execute Payment)
// ============================================================
export const executePayment = async (paymentID) => {
  try {
    const token = await generateToken();

    const response = await fetch(`${config.baseURL}/checkout/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'X-APP-Key': config.appKey
      },
      body: JSON.stringify({
        paymentID: paymentID
      })
    });

    const data = await response.json();

    if (data.statusCode === '0000') {
      return {
        success: true,
        trxID: data.trxID,
        amount: data.amount,
        paymentID: data.paymentID,
        merchantInvoiceNumber: data.merchantInvoiceNumber
      };
    } else {
      return {
        success: false,
        error: data.statusMessage || 'Payment execution failed'
      };
    }
  } catch (error) {
    console.error('Execute payment error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// ============================================================
// ✅ ৪. পেমেন্ট কুয়েরি (Query Payment)
// ============================================================
export const queryPayment = async (paymentID) => {
  try {
    const token = await generateToken();

    const response = await fetch(`${config.baseURL}/checkout/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'X-APP-Key': config.appKey
      },
      body: JSON.stringify({
        paymentID: paymentID
      })
    });

    const data = await response.json();

    if (data.statusCode === '0000') {
      return {
        success: true,
        status: data.transactionStatus,
        amount: data.amount,
        paymentID: data.paymentID,
        trxID: data.trxID
      };
    } else {
      return {
        success: false,
        status: 'Failed',
        error: data.statusMessage || 'Query failed'
      };
    }
  } catch (error) {
    console.error('Query payment error:', error);
    return {
      success: false,
      status: 'Failed',
      error: error.message
    };
  }
};

// ============================================================
// ✅ ৫. পেমেন্ট রিফান্ড (Refund)
// ============================================================
export const refundPayment = async (paymentID, amount, trxID) => {
  try {
    const token = await generateToken();

    const response = await fetch(`${config.baseURL}/checkout/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'X-APP-Key': config.appKey
      },
      body: JSON.stringify({
        paymentID: paymentID,
        amount: amount.toString(),
        trxID: trxID,
        sku: 'refund',
        reason: 'Refund requested by customer'
      })
    });

    const data = await response.json();

    if (data.statusCode === '0000') {
      return {
        success: true,
        refundID: data.refundID,
        amount: data.amount
      };
    } else {
      return {
        success: false,
        error: data.statusMessage || 'Refund failed'
      };
    }
  } catch (error) {
    console.error('Refund error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};