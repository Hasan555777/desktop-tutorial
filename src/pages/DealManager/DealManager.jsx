// DealManager.jsx
// Main page component. Composes dealManager.hooks.js and
// DealManager.components.jsx. Same behavior as your original file.

import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { auth } from '@/firebase';
import './DealManager.css';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useNotification } from '@/UI/Notification/NotificationProvider';
import DealGuideModal from './components/DealGuideModal';

import { LOCAL_STORAGE_MODE_KEY, MAX_EXTENSIONS } from '@/constants/dealManager.constants';
import { useDealsList, useSelectedDeal, useDeadlineCountdown, useDealBackgroundSweep, useDealGuide, useDealActions } from '@/hooks/dealManager.hooks';
import { ModeSwitcher, DealsStats, DealsList, DealHeader, DealBanners, DealInfoCard, MilestoneList } from '@/components/DealManager.components';

const DealManager = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dealId = searchParams.get('dealId') || searchParams.get('postId');
  const feedback = useFeedback();
  const notification = useNotification();

  const [currentMode, setCurrentMode] = useState(() => localStorage.getItem(LOCAL_STORAGE_MODE_KEY) || 'buyer');
  const [currentUser, setCurrentUser] = useState(null);
  const [showCancelledDeals, setShowCancelledDeals] = useState(false);

  // ── Auth ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsubscribe();
  }, []);

  // ── Data ──────────────────────────────────────────────────────────
  const { deals, setDeals, loadingList } = useDealsList(currentUser, currentMode);
  const { selectedDeal, setSelectedDeal, loadingDeal } = useSelectedDeal(dealId);
  const loading = dealId ? loadingDeal : loadingList;

  const handleModeChange = (mode) => {
    setCurrentMode(mode);
    localStorage.setItem(LOCAL_STORAGE_MODE_KEY, mode);
    setSelectedDeal(null);
  };

  // ── Background timers ────────────────────────────────────────────
  const timeRemaining = useDeadlineCountdown(selectedDeal, setSelectedDeal, notification);
  useDealBackgroundSweep(deals, notification, setSelectedDeal, selectedDeal?.id);

  // ── Guide popup wrapper ───────────────────────────────────────────
  const { showGuideModal, runWithGuide, handleGuideConfirm, handleGuideCancel } = useDealGuide();

  // ── All mutation handlers ────────────────────────────────────────
  const {
    handleExtendDeadline,
    handleSubmitWork,
    handleRejectWork,
    handleReleasePayment,
    handleExtensionResponse,
    handleConfirmDeal,
    handleCancelDeal,
    handleCancelResponse,
    handleOpenDispute,
    submittingMilestone,
    releasingPayment,
    rejectingWork,
    openSubmitForm,
    setOpenSubmitForm,
    workDraft,
    setWorkDraft,
  } = useDealActions({
    selectedDeal,
    setSelectedDeal,
    setDeals,
    currentUser,
    currentMode,
    feedback,
    notification,
    navigate,
  });

  // ── Loading state ────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: 'var(--bg-primary, #090d16)',
          color: 'var(--accent-primary, #14b8a6)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <i className="fa-solid fa-cube" style={{ fontSize: '48px', animation: 'spin 2s linear infinite', display: 'block', marginBottom: '16px' }} />
          <h2>Loading Deals...</h2>
          <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '8px', fontSize: '14px' }}>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your deals...
          </p>
        </div>
      </div>
    );
  }

  const cancelledDeals = deals.filter((deal) => deal.status === 'cancelled');
  const activeDeals = deals.filter((deal) => deal.status !== 'cancelled');
  const pendingCount = deals.filter((d) => d.status === 'pending').length;
  const activeCount = deals.filter((d) => d.status === 'active').length;
  const overdueCount = deals.filter((d) => d.status === 'overdue').length;
  const completedCount = deals.filter((d) => d.status === 'completed').length;
  const totalDeals = deals.length;

  return (
    <div className="dashboard-container-wrapper">
      <div className="dashboard-wrapper">
        <DealGuideModal show={showGuideModal} role="accepter" onConfirm={handleGuideConfirm} onCancel={handleGuideCancel} />

        <ModeSwitcher
          currentMode={currentMode}
          handleModeChange={handleModeChange}
          pendingCount={pendingCount}
          showCancelledDeals={showCancelledDeals}
          setShowCancelledDeals={setShowCancelledDeals}
          cancelledCount={cancelledDeals.length}
        />

        <DealsStats
          totalDeals={totalDeals}
          pendingCount={pendingCount}
          activeCount={activeCount}
          overdueCount={overdueCount}
          completedCount={completedCount}
          cancelledCount={cancelledDeals.length}
        />

        {dealId && selectedDeal ? (
          <>
            <DealHeader selectedDeal={selectedDeal} currentMode={currentMode} timeRemaining={timeRemaining} navigate={navigate} feedback={feedback} />

            <DealBanners
              selectedDeal={selectedDeal}
              currentUser={currentUser}
              currentMode={currentMode}
              handleExtendDeadline={handleExtendDeadline}
              handleCancelDeal={handleCancelDeal}
              handleOpenDispute={handleOpenDispute}
              handleExtensionResponse={handleExtensionResponse}
              handleCancelResponse={handleCancelResponse}
              setSelectedDeal={setSelectedDeal}
            />

            <DealInfoCard selectedDeal={selectedDeal} currentMode={currentMode} timeRemaining={timeRemaining} />

            <MilestoneList
              selectedDeal={selectedDeal}
              currentMode={currentMode}
              currentUser={currentUser}
              navigate={navigate}
              runWithGuide={runWithGuide}
              handleConfirmDeal={handleConfirmDeal}
              handleCancelResponse={handleCancelResponse}
              releasingPayment={releasingPayment}
              rejectingWork={rejectingWork}
              submittingMilestone={submittingMilestone}
              openSubmitForm={openSubmitForm}
              setOpenSubmitForm={setOpenSubmitForm}
              workDraft={workDraft}
              setWorkDraft={setWorkDraft}
              onReleasePayment={handleReleasePayment}
              onRejectWork={handleRejectWork}
              onSubmitWork={handleSubmitWork}
            />

            {(selectedDeal.status === 'pending' || selectedDeal.status === 'active') &&
              selectedDeal.disputeStatus !== 'open' &&
              !selectedDeal.cancelRequestedBy && (
                <div className="cancel-deal-section">
                  <button className="btn-cancel-deal" onClick={handleCancelDeal}>
                    <i className="fa-solid fa-ban"></i> Request Cancellation
                  </button>
                  <p className="cancel-warning">
                    <i className="fa-solid fa-info-circle"></i>
                    Your request must be approved by the other party.
                  </p>
                </div>
              )}
          </>
        ) : (
          <DealsList
            showCancelledDeals={showCancelledDeals}
            cancelledDeals={cancelledDeals}
            activeDeals={activeDeals}
            currentMode={currentMode}
            navigate={navigate}
            timeRemaining={timeRemaining}
          />
        )}
      </div>
    </div>
  );
};

export default DealManager;
