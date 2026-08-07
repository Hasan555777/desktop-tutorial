// src/layout/GlobalPopups.jsx

import React from 'react';
import { useAnnouncement } from '@/hooks/useAnnouncement';
import AnnouncementPopup from '@/components/AnnouncementPopup/AnnouncementPopup';

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