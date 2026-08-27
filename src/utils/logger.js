// src/utils/logger.js
//
// প্রোডাকশনে raw console.log/console.warn ছড়িয়ে না থাকার জন্য একটা পাতলা
// wrapper। dev-এ (import.meta.env.DEV) সবকিছু স্বাভাবিকভাবে দেখাবে;
// prod build-এ debug/info নিঃশব্দ, শুধু error/warn থাকবে (চাইলে সেগুলোও
// এখান থেকে Sentry/অন্য কোনো monitoring-এ পাঠানো যায়)।

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

export const logger = {
  debug: (...args) => {
    if (isDev) console.log(...args);
  },
  info: (...args) => {
    if (isDev) console.info(...args);
  },
  warn: (...args) => {
    console.warn(...args);
  },
  error: (...args) => {
    console.error(...args);
    // TODO: এখানে Sentry.captureException(...) বা অন্য কোনো monitoring
    // hook যোগ করা যেতে পারে, prod-এও error ট্র্যাক করার জন্য।
  },
};

// FeedbackProvider.jsx এবং AuthContext.jsx ইতিমধ্যে '@/utils/logger'-এর
// logError/logInfo নামেই named export এক্সপেক্ট করে — সেই নামেও এক্সপোর্ট
// করা হলো, যাতে বিদ্যমান ইমপোর্ট ভাঙে না। (আগে logInfo মিসিং ছিল —
// AuthContext.jsx-এর logout()-এ import করা হলেও এক্সপোর্ট না থাকায়
// `logInfo is not a function` ছুড়ে logout() ব্যর্থ হতো।)
export const logError = logger.error;
export const logInfo = logger.info;
export const logWarn = logger.warn;
export const logDebug = logger.debug;

export default logger;