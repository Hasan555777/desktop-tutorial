// src/services/announcementStorage.js

// ============================================================
// 📌 CONSTANTS
// ============================================================
const STORAGE_KEY = 'worktrustbd_announcements';
// ✅ VERSION_KEY больше не нужен
// const VERSION_KEY = 'worktrustbd_last_seen_announcement_version';

// ============================================================
// 🎯 MAIN STORAGE OBJECT
// ============================================================
export const announcementStorage = {
  
  // ── Base Methods ──
  getData() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return {};
      return JSON.parse(data);
    } catch {
      return {};
    }
  },

  saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  },

  // ── Dismiss Methods ──
  isVersionDismissed(category, version) {
    const data = this.getData();
    const key = `${category}_${version}`;
    return !!data[key];
  },

  dismissVersion(category, version) {
    const data = this.getData();
    const key = `${category}_${version}`;
    data[key] = true;
    return this.saveData(data);
  },

  resetAll() {
    return this.saveData({});
  },

  getDismissedCount() {
    const data = this.getData();
    return Object.keys(data).length;
  },

  // ── ✅ Core Method: Should Show Announcement ──
  shouldShowAnnouncement(announcement) {
    if (!announcement || !announcement.active) return false;

    const version = announcement.version || 0;
    const category = announcement.category || 'default';

    // ✅ শুধু permanent dismiss চেক করি
    if (this.isVersionDismissed(category, version)) {
      return false;
    }

    return true;
  },

  // ── ✅ Dismiss and Never Show Again ──
  dismissAndSeen(announcement) {
    if (!announcement) return false;

    const version = announcement.version || 0;
    const category = announcement.category || 'default';

    // ✅ শুধু dismiss করি, lastSeenVersion update করি না
    return this.dismissVersion(category, version);
  },

  // ── New: Clear All Data ──
  clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      // localStorage.removeItem(VERSION_KEY); // আর নেই
      return true;
    } catch {
      return false;
    }
  },

  // ── New: Get Stats ──
  getStats() {
    return {
      dismissedCount: this.getDismissedCount(),
      hasDismissedData: Object.keys(this.getData()).length > 0
    };
  },

  // ── Migration Support ──
  migrate(oldVersion) {
    return true;
  }
};

// ============================================================
// 📌 DEFAULT EXPORT
// ============================================================
export default announcementStorage;