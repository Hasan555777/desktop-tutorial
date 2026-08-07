// src/firebase/messaging.js

import { getMessaging, getToken, onMessage, deleteToken } from "firebase/messaging";
import { app } from "@/firebase";

// ✅ Initialize Firebase Messaging
const messaging = getMessaging(app);

// ✅ Export all messaging functions
export { 
  messaging, 
  getToken, 
  onMessage, 
  deleteToken 
};

export default messaging;