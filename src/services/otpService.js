// src/services/otpService.js
// OTP Worker এর সাথে যোগাযোগ করার জন্য সার্ভিস

// ============================================================
// কনফিগারেশন
// ============================================================

// লোকাল ডেভেলপমেন্টে http://localhost:8787
// প্রোডাকশনে আপনার Worker URL
const WORKER_URL = import.meta.env.VITE_OTP_WORKER_URL || 'http://localhost:8787';

// ============================================================
// OTP সেন্ড করুন
// ============================================================

/**
 * OTP সেন্ড করুন
 * @param {string} phone - 11 ডিজিটের ফোন নম্বর (যেমন: 01712345678)
 * @returns {Promise<{success: boolean, message: string, otp?: string}>}
 */
export const sendOtp = async (phone) => {
  try {
    console.log('📤 Sending OTP to:', `${WORKER_URL}/send-otp`);
    console.log('📱 Phone:', phone);

    const response = await fetch(`${WORKER_URL}/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'OTP সেন্ড করতে ব্যর্থ!');
    }

    console.log('📥 Response:', data);
    return data;
  } catch (error) {
    console.error('❌ Send OTP Error:', error);
    throw error;
  }
};

// ============================================================
// OTP ভেরিফাই করুন
// ============================================================

/**
 * OTP ভেরিফাই করুন
 * @param {string} phone - 11 ডিজিটের ফোন নম্বর
 * @param {string} otp - 6 ডিজিটের OTP
 * @returns {Promise<{success: boolean, verified: boolean, message: string}>}
 */
export const verifyOtp = async (phone, otp) => {
  try {
    console.log('📤 Verifying OTP for:', phone);
    console.log('🔑 OTP:', otp);

    const response = await fetch(`${WORKER_URL}/verify-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, otp }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'OTP ভেরিফাই করতে ব্যর্থ!');
    }

    console.log('📥 Verify Response:', data);
    return data;
  } catch (error) {
    console.error('❌ Verify OTP Error:', error);
    throw error;
  }
};

// ============================================================
// ফোন নম্বর নরমালাইজ করুন (BD ফরম্যাট)
// ============================================================

/**
 * ফোন নম্বর নরমালাইজ করুন (BD ফরম্যাটে)
 * @param {string} phone - ইনপুট ফোন নম্বর
 * @returns {string|null} নরমালাইজড ফোন নম্বর (8801XXXXXXXXX)
 * 
 * @example
 * normalizePhone('01712345678')    // '8801712345678'
 * normalizePhone('+8801712345678') // '8801712345678'
 * normalizePhone('8801712345678')  // '8801712345678'
 */
export const normalizePhone = (phone) => {
  if (!phone) {
    return null;
  }

  let value = String(phone).trim();

  // স্পেস, হাইফেন ইত্যাদি রিমুভ
  value = value.replace(/[\s-]/g, '');

  // 01XXXXXXXXX → 8801XXXXXXXXX
  if (/^01\d{9}$/.test(value)) {
    return '880' + value.substring(1);
  }

  // +8801XXXXXXXXX → 8801XXXXXXXXX
  if (/^\+8801\d{9}$/.test(value)) {
    return value.substring(1);
  }

  // 8801XXXXXXXXX
  if (/^8801\d{9}$/.test(value)) {
    return value;
  }

  return null;
};

// ============================================================
// হেল্পার: ফোন নম্বর ভ্যালিডেশন
// ============================================================

/**
 * ফোন নম্বর ভ্যালিড করুন (BD)
 * @param {string} phone - ফোন নম্বর
 * @returns {boolean} ভ্যালিড কিনা
 */
export const isValidBDPhone = (phone) => {
  const normalized = normalizePhone(phone);
  return normalized !== null && /^8801[3-9]\d{8}$/.test(normalized);
};

// ============================================================
// ডিফল্ট এক্সপোর্ট
// ============================================================

export default {
  sendOtp,
  verifyOtp,
  normalizePhone,
  isValidBDPhone,
};