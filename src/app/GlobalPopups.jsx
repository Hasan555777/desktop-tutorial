// src/layout/GlobalPopups.jsx

import React from 'react';
import { useAnnouncement } from '../features/announcements/hooks/useAnnouncement';
import AnnouncementPopup from '../features/announcements/components/AnnouncementPopup/AnnouncementPopup';

// ✅ Future popups will be added here
const GlobalPopups = () => {
  const {
    announcement,
    showPopup,
    loading,
    dismiss,
    dismissForever,
    refresh
  } = useAnnouncement();

  return (
    <>
      {/* Announcement Popup */}
      <AnnouncementPopup
        announcement={announcement}
        showPopup={showPopup}
        loading={loading}
        onDismiss={dismiss}
        onDismissForever={dismissForever}
      />
      
      {/* Future popups will go here */}
      {/* <MaintenancePopup /> */}
      {/* <SurveyPopup /> */}
      {/* <ReviewPopup /> */}
    </>
  );
};

export default GlobalPopups;