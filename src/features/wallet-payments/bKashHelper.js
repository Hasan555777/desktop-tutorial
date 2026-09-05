// src/features/wallet-payments/bKashHelper.js
//
// ⚠️ STUB FILE — এটা মূল zip-এ ছিল না, কিন্তু paymentFlow.js এখান থেকে
// createPayment / executePayment / queryPayment import করে ব্যবহার করে।
// আসল bKash Merchant API ইন্টিগ্রেশন (grant token, create/execute/query
// payment endpoint কল) এখানে এখনও লেখা হয়নি — build/import যাতে না
// ভাঙে সেজন্য শুধু placeholder রাখা হলো। প্রোডাকশনে ব্যবহারের আগে এই
// তিনটা ফাংশন আসল bKash API দিয়ে বাস্তবায়ন করতে হবে।

const NOT_IMPLEMENTED = (name) => {
  throw new Error(
    `[bKashHelper] "${name}" এখনো ইমপ্লিমেন্ট করা হয়নি — আসল bKash Merchant API ইন্টিগ্রেশন বাকি।`
  );
};

export async function createPayment(amount, orderId, reference) {
  return NOT_IMPLEMENTED('createPayment');
}

export async function executePayment(paymentID) {
  return NOT_IMPLEMENTED('executePayment');
}

export async function queryPayment(paymentID) {
  return NOT_IMPLEMENTED('queryPayment');
}
