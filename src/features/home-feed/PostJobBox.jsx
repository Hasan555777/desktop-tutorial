// src/components/PostJobBox/PostJobBox.jsx

import React, { useState, useRef } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../shared/firebase/index';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import styles from './PostJobBox.module.css';

function PostJobBox({ onClose, setActiveTab, onSilentPost, currentUser }) {
  const [jobTitle, setJobTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  usePageLoadingBar(loading);
  const [error, setError] = useState('');
  
  const [budgetType, setBudgetType] = useState('fixed');
  const [deadlineType, setDeadlineType] = useState('fixed');
  const [minBudget, setMinBudget] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [minDeadline, setMinDeadline] = useState('');
  const [maxDeadline, setMaxDeadline] = useState('');
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [showBudgetRange, setShowBudgetRange] = useState(false);
  const [showDeadlineRange, setShowDeadlineRange] = useState(false);
  
  const feedback = useFeedback();
  const isSubmitting = useRef(false);
  const lastSubmitTime = useRef(0);

  const BUDGET_OPTIONS = {
    min: 100,
    max: 1000000,
    step: 100
  };

  const DEADLINE_OPTIONS = {
    min: 1,
    max: 365,
    step: 1
  };

  const validateForm = () => {
    if (!jobTitle.trim()) {
      setError('Please enter a job title');
      return false;
    }
    if (jobTitle.trim().length < 5) {
      setError('Job title must be at least 5 characters');
      return false;
    }

    if (!description.trim()) {
      setError('Please enter a job description');
      return false;
    }
    if (description.trim().length < 20) {
      setError('Description must be at least 20 characters');
      return false;
    }

    if (budgetType === 'fixed') {
      if (!budget || Number(budget) < BUDGET_OPTIONS.min) {
        setError(`Budget must be at least ${BUDGET_OPTIONS.min} BDT`);
        return false;
      }
      if (Number(budget) > BUDGET_OPTIONS.max) {
        setError(`Budget cannot exceed ${BUDGET_OPTIONS.max.toLocaleString()} BDT`);
        return false;
      }
    } else {
      if (!minBudget || Number(minBudget) < BUDGET_OPTIONS.min) {
        setError(`Minimum budget must be at least ${BUDGET_OPTIONS.min} BDT`);
        return false;
      }
      if (!maxBudget || Number(maxBudget) > BUDGET_OPTIONS.max) {
        setError(`Maximum budget cannot exceed ${BUDGET_OPTIONS.max.toLocaleString()} BDT`);
        return false;
      }
      if (Number(minBudget) > Number(maxBudget)) {
        setError('Minimum budget cannot be greater than maximum budget');
        return false;
      }
      if (Number(maxBudget) - Number(minBudget) < 100) {
        setError('Budget range must be at least 100 BDT apart');
        return false;
      }
    }

    if (deadlineType === 'fixed') {
      if (!deadline || Number(deadline) < DEADLINE_OPTIONS.min) {
        setError(`Deadline must be at least ${DEADLINE_OPTIONS.min} day`);
        return false;
      }
      if (Number(deadline) > DEADLINE_OPTIONS.max) {
        setError(`Deadline cannot exceed ${DEADLINE_OPTIONS.max} days`);
        return false;
      }
    } else {
      if (!minDeadline || Number(minDeadline) < DEADLINE_OPTIONS.min) {
        setError(`Minimum deadline must be at least ${DEADLINE_OPTIONS.min} day`);
        return false;
      }
      if (!maxDeadline || Number(maxDeadline) > DEADLINE_OPTIONS.max) {
        setError(`Maximum deadline cannot exceed ${DEADLINE_OPTIONS.max} days`);
        return false;
      }
      if (Number(minDeadline) > Number(maxDeadline)) {
        setError('Minimum deadline cannot be greater than maximum deadline');
        return false;
      }
      if (Number(maxDeadline) - Number(minDeadline) < 1) {
        setError('Deadline range must be at least 1 day apart');
        return false;
      }
    }

    if (isNegotiable === null || isNegotiable === undefined) {
      setError('Please specify if the budget is negotiable or not');
      return false;
    }

    return true;
  };

  const handlePublishJob = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    setError('');
    
    const now = Date.now();
    if (now - lastSubmitTime.current < 2000) {
      console.log("⏳ Too fast, ignoring duplicate request");
      return;
    }
    
    if (isSubmitting.current || loading) {
      console.log("⏳ Already submitting");
      return;
    }
    
    if (!currentUser) {
      setError("Please login to post a job!");
      return;
    }
    
    if (!validateForm()) {
      return;
    }
    
    isSubmitting.current = true;
    setLoading(true);
    lastSubmitTime.current = now;
    
    const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let budgetData = {};
    if (budgetType === 'fixed') {
      budgetData = {
        type: 'fixed',
        amount: Number(budget),
        isNegotiable: isNegotiable
      };
    } else {
      budgetData = {
        type: 'range',
        min: Number(minBudget),
        max: Number(maxBudget),
        isNegotiable: isNegotiable
      };
    }

    let deadlineData = {};
    if (deadlineType === 'fixed') {
      deadlineData = {
        type: 'fixed',
        days: Number(deadline)
      };
    } else {
      deadlineData = {
        type: 'range',
        min: Number(minDeadline),
        max: Number(maxDeadline)
      };
    }

    const jobData = {
      type: 'hire',
      mode: 'buyer',
      title: jobTitle.trim(),
      description: description.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: 'pending',
      userId: currentUser.uid,
      buyerId: currentUser.uid,
      sellerId: null,
      clientName: currentUser.displayName || currentUser.email?.split('@')[0] || "Job Poster",
      clientPhoto: currentUser.photoURL || null,
      clientEmail: currentUser.email,
      verified: false,
      proposals: 0,
      images: [],
      _uniqueId: uniqueId,
      
      budget: budgetData,
      deadline: deadlineData,
      isNegotiable: isNegotiable,
      
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectReason: null,
      
      editStatus: null,
      pendingChanges: null,
      editSubmittedAt: null,
      editApprovedAt: null,
      editRejectedAt: null,
      editRejectReason: null,
    };

    try {
      console.log("📤 Publishing job with budget rules:", budgetData);
      
      const postRef = doc(db, 'posts', uniqueId);
      await setDoc(postRef, jobData);
      
      console.log("✅ Job posted with ID:", uniqueId);
      
      setJobTitle('');
      setDescription('');
      setBudget('');
      setDeadline('');
      setMinBudget('');
      setMaxBudget('');
      setMinDeadline('');
      setMaxDeadline('');
      setBudgetType('fixed');
      setDeadlineType('fixed');
      setIsNegotiable(false);
      setError('');
      
      feedback.showSuccess(
        '✅ Job Posted!',
        'Your job has been submitted for admin approval. It will be published once approved.',
        'JOB_SUBMITTED'
      );
      
      if (currentUser?.uid) {
        try {
          await addDoc(collection(db, 'notifications'), {
            userId: currentUser.uid,
            type: 'job_submitted',
            title: '📝 Job Submitted for Approval',
            message: `Your job "${jobTitle.trim()}" is pending admin approval. You will be notified once it's approved.`,
            isUnread: true,
            createdAt: serverTimestamp()
          });
        } catch (notifError) {
          console.error('Notification error:', notifError);
        }
      }
      
      if (setActiveTab) setActiveTab('dashboard');
      if (onClose) onClose();
      
    } catch (error) {
      console.error("❌ Error:", error);
      setError('Failed to publish job: ' + error.message);
      
      feedback.showError(
        '❌ Failed to Post',
        error.message || 'Something went wrong. Please try again.',
        'POST_ERROR'
      );
    } finally {
      setLoading(false);
      setTimeout(() => {
        isSubmitting.current = false;
      }, 1000);
    }
  };

  const handleReset = () => {
    if (!loading) {
      setJobTitle('');
      setDescription('');
      setBudget('');
      setDeadline('');
      setMinBudget('');
      setMaxBudget('');
      setMinDeadline('');
      setMaxDeadline('');
      setBudgetType('fixed');
      setDeadlineType('fixed');
      setIsNegotiable(false);
      setError('');
      setShowBudgetRange(false);
      setShowDeadlineRange(false);
    }
  };

  return (
    <div className={styles.globalModalOverlay} onClick={onClose}>
      <div className={styles.postAddBox} onClick={(e) => e.stopPropagation()}>
        
        <div className={styles.pboxHeader}>
          <h3>
            <i className="fa-solid fa-briefcase" style={{ color: '#fbbf24' }}></i> 
            Post a New Job
          </h3>
          <button type="button" className={styles.pboxCloseBtn} onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className={styles.pboxNotice}>
          <i className="fa-solid fa-clock"></i>
          <span>
            <strong>Pending Approval:</strong> Your job will be reviewed by admin before publishing.
          </span>
        </div>

        <form onSubmit={handlePublishJob}>
          <div className={styles.pboxBodyForm}>
            
            {error && (
              <div className={styles.pboxError}>
                <i className="fa-solid fa-exclamation-circle"></i>
                {error}
              </div>
            )}

            {/* Job Title */}
            <div className={styles.pbGroup}>
              <label>
                Job Title <span className={styles.requiredStar}>*</span>
              </label>
              <input 
                type="text" 
                value={jobTitle} 
                onChange={(e) => setJobTitle(e.target.value)} 
                placeholder="e.g., Need a React Developer" 
                required 
                disabled={loading}
              />
              <small>Minimum 5 characters</small>
            </div>

            {/* Budget Section */}
            <div className={styles.pbGroup}>
              <label>
                Budget <span className={styles.requiredStar}>*</span>
              </label>
              
              <div className={styles.pbRadioGroup}>
                <label className={styles.pbRadioLabel}>
                  <input
                    type="radio"
                    name="budgetType"
                    value="fixed"
                    checked={budgetType === 'fixed'}
                    onChange={() => {
                      setBudgetType('fixed');
                      setShowBudgetRange(false);
                      setMinBudget('');
                      setMaxBudget('');
                    }}
                    disabled={loading}
                  />
                  Fixed Amount
                </label>
                <label className={styles.pbRadioLabel}>
                  <input
                    type="radio"
                    name="budgetType"
                    value="range"
                    checked={budgetType === 'range'}
                    onChange={() => {
                      setBudgetType('range');
                      setShowBudgetRange(true);
                      setBudget('');
                    }}
                    disabled={loading}
                  />
                  Range (Negotiable)
                </label>
              </div>

              {budgetType === 'fixed' ? (
                <div className={styles.pbBudgetFixed}>
                  <input 
                    type="number" 
                    value={budget} 
                    onChange={(e) => setBudget(e.target.value)} 
                    placeholder={`e.g., 5000 (Min: ${BUDGET_OPTIONS.min})`} 
                    min={BUDGET_OPTIONS.min} 
                    max={BUDGET_OPTIONS.max}
                    step={BUDGET_OPTIONS.step}
                    disabled={loading}
                  />
                  <small>
                    Min: {BUDGET_OPTIONS.min.toLocaleString()} BDT • 
                    Max: {BUDGET_OPTIONS.max.toLocaleString()} BDT
                  </small>
                </div>
              ) : (
                <div className={styles.pbBudgetRange}>
                  <div className={styles.pbRowTwin}>
                    <div className={styles.pbGroup}>
                      <label>Min Budget</label>
                      <input 
                        type="number" 
                        value={minBudget} 
                        onChange={(e) => setMinBudget(e.target.value)} 
                        placeholder={`Min: ${BUDGET_OPTIONS.min}`} 
                        min={BUDGET_OPTIONS.min} 
                        max={BUDGET_OPTIONS.max}
                        step={BUDGET_OPTIONS.step}
                        disabled={loading}
                      />
                    </div>
                    <div className={styles.pbGroup}>
                      <label>Max Budget</label>
                      <input 
                        type="number" 
                        value={maxBudget} 
                        onChange={(e) => setMaxBudget(e.target.value)} 
                        placeholder={`Max: ${BUDGET_OPTIONS.max}`} 
                        min={BUDGET_OPTIONS.min} 
                        max={BUDGET_OPTIONS.max}
                        step={BUDGET_OPTIONS.step}
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <small>Range must be at least 100 BDT apart</small>
                </div>
              )}
            </div>

            {/* Deadline Section */}
            <div className={styles.pbGroup}>
              <label>
                Deadline <span className={styles.requiredStar}>*</span>
              </label>
              
              <div className={styles.pbRadioGroup}>
                <label className={styles.pbRadioLabel}>
                  <input
                    type="radio"
                    name="deadlineType"
                    value="fixed"
                    checked={deadlineType === 'fixed'}
                    onChange={() => {
                      setDeadlineType('fixed');
                      setShowDeadlineRange(false);
                      setMinDeadline('');
                      setMaxDeadline('');
                    }}
                    disabled={loading}
                  />
                  Fixed Days
                </label>
                <label className={styles.pbRadioLabel}>
                  <input
                    type="radio"
                    name="deadlineType"
                    value="range"
                    checked={deadlineType === 'range'}
                    onChange={() => {
                      setDeadlineType('range');
                      setShowDeadlineRange(true);
                      setDeadline('');
                    }}
                    disabled={loading}
                  />
                  Range (Flexible)
                </label>
              </div>

              {deadlineType === 'fixed' ? (
                <div className={styles.pbDeadlineFixed}>
                  <input 
                    type="number" 
                    value={deadline} 
                    onChange={(e) => setDeadline(e.target.value)} 
                    placeholder={`e.g., 7 (Min: ${DEADLINE_OPTIONS.min})`} 
                    min={DEADLINE_OPTIONS.min} 
                    max={DEADLINE_OPTIONS.max}
                    step={DEADLINE_OPTIONS.step}
                    disabled={loading}
                  />
                  <small>
                    Min: {DEADLINE_OPTIONS.min} day • 
                    Max: {DEADLINE_OPTIONS.max} days
                  </small>
                </div>
              ) : (
                <div className={styles.pbDeadlineRange}>
                  <div className={styles.pbRowTwin}>
                    <div className={styles.pbGroup}>
                      <label>Min Days</label>
                      <input 
                        type="number" 
                        value={minDeadline} 
                        onChange={(e) => setMinDeadline(e.target.value)} 
                        placeholder={`Min: ${DEADLINE_OPTIONS.min}`} 
                        min={DEADLINE_OPTIONS.min} 
                        max={DEADLINE_OPTIONS.max}
                        step={DEADLINE_OPTIONS.step}
                        disabled={loading}
                      />
                    </div>
                    <div className={styles.pbGroup}>
                      <label>Max Days</label>
                      <input 
                        type="number" 
                        value={maxDeadline} 
                        onChange={(e) => setMaxDeadline(e.target.value)} 
                        placeholder={`Max: ${DEADLINE_OPTIONS.max}`} 
                        min={DEADLINE_OPTIONS.min} 
                        max={DEADLINE_OPTIONS.max}
                        step={DEADLINE_OPTIONS.step}
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <small>Range must be at least 1 day apart</small>
                </div>
              )}
            </div>

            {/* Job Description */}
            <div className={styles.pbGroup}>
              <label>
                Job Description <span className={styles.requiredStar}>*</span>
                <span className={styles.charCount}>{description.length}/5000</span>
              </label>
              <textarea 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                rows="5" 
                placeholder="Detailed description of the job (minimum 20 characters)" 
                maxLength="5000"
                required 
                disabled={loading}
              />
              <small>Minimum 20 characters</small>
            </div>

          </div>

          <div className={styles.pboxFooter}>
            <button 
              type="button" 
              className={`${styles.pboxBtn} ${styles.pbBtnClose}`} 
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="reset" 
              className={`${styles.pboxBtn} ${styles.pbBtnReset}`} 
              onClick={handleReset}
              disabled={loading}
            >
              <i className="fa-solid fa-rotate"></i> Reset
            </button>
            <button 
              type="submit" 
              className={`${styles.pboxBtn} ${styles.pbBtnPublish}`} 
              disabled={loading}
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i> Submitting...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-paper-plane"></i> Submit for Approval
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PostJobBox;