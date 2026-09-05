// src/services/announcementTypes.js

export const AnnouncementTypes = {
  INFO: 'info',
  WARNING: 'warning',
  SUCCESS: 'success',
  DANGER: 'danger',
  FEATURE: 'feature',
  MAINTENANCE: 'maintenance'
};

export const AnnouncementTypeConfig = {
  [AnnouncementTypes.INFO]: {
    icon: 'fa-solid fa-circle-info',
    color: '#3b82f6',
    bg: '#eff6ff'
  },
  [AnnouncementTypes.WARNING]: {
    icon: 'fa-solid fa-triangle-exclamation',
    color: '#f59e0b',
    bg: '#fffbeb'
  },
  [AnnouncementTypes.SUCCESS]: {
    icon: 'fa-solid fa-check-circle',
    color: '#22c55e',
    bg: '#f0fdf4'
  },
  [AnnouncementTypes.DANGER]: {
    icon: 'fa-solid fa-circle-exclamation',
    color: '#ef4444',
    bg: '#fef2f2'
  },
  [AnnouncementTypes.FEATURE]: {
    icon: 'fa-solid fa-wand-magic-sparkles',
    color: '#8b5cf6',
    bg: '#f5f3ff'
  },
  [AnnouncementTypes.MAINTENANCE]: {
    icon: 'fa-solid fa-wrench',
    color: '#f97316',
    bg: '#fff7ed'
  }
};

export const getTypeStyle = (type) => {
  return AnnouncementTypeConfig[type] || AnnouncementTypeConfig[AnnouncementTypes.INFO];
};