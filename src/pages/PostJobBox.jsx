// src/components/PostJobBox/PostJobBox.jsx

import React, { useState, useRef } from 'react';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import './PostJobBox.css';

function PostJobBox({ onClose, setActiveTab, onSilentPost, currentUser }) {
  const [jobTitle, setJobTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // ✅ New States for Budget & Deadline Rules
  const [budgetType, setBudgetType] = useState('fixed'); // 'fixed' or 'range'
  const [deadlineType, setDeadlineType] = useState('fixed'); // ✅ FIXED
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

  // ── Budget Options ──
  const BUDGET_OPTIONS = {
    min: 100,
    max: 1000000,
    step: 100
  };

  // ── Deadline Options ──
  const DEADLINE_OPTIONS = {
    min: 1,
    max: 365,
    step: 1
  };

  // ============================================================
  // ✅ ফর্ম ভ্যালিডেশন
  // ============================================================
  const validateForm = () => {
    // ── Title Validation ──
    if (!jobTitle.trim()) {
      setError('Please enter a job title');
      return false;
    }
    if (jobTitle.trim().length < 5) {
      setError('Job title must be at least 5 characters');
      return false;
    }

    // ── Description Validation ──
    if (!description.trim()) {
      setError('Please enter a job description');
      return false;
    }
    if (description.trim().length < 20) {
      setError('Description must be at least 20 characters');
      return false;
    }

    // ── Budget Validation ──
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

    // ── Deadline Validation ──
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

    // ── Negotiable Validation (বাধ্যতামূলক) ──
    if (isNegotiable === null || isNegotiable === undefined) {
      setError('Please specify if the budget is negotiable or not');
      return false;
    }

    return true;
  };

  // ============================================================
  // ✅ ফর্ম সাবমিট
  // ============================================================
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
    
    // ── Prepare Budget Data ──
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

    // ── Prepare Deadline Data ──
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

    // ✅ Job Data
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
      
      // ✅ ফর্ম রিসেট
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
      
      // ✅ Success Toast
      feedback.showSuccess(
        '✅ Job Posted!',
        'Your job has been submitted for admin approval. It will be published once approved.',
        'JOB_SUBMITTED'
      );
      
      // ✅ Notification to user
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
      
      // ✅ Close modal and switch tab
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

  // ============================================================
  // ✅ ফর্ম রিসেট
  // ============================================================
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

  // ============================================================
  // ✅ রেন্ডার (শুধু Deadline Radio Button অংশ)
  // ============================================================
  return (
    <div className="global-modal-overlay" onClick={onClose}>
      <div className="post-add-box" onClick={(e) => e.stopPropagation()}>
        
        <div className="pbox-header">
          <h3>
            <i className="fa-solid fa-briefcase" style={{ color: '#fbbf24' }}></i> 
            Post a New Job
          </h3>
          <button type="button" className="pbox-close-btn" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* ✅ Pending Status Notice */}
        <div className="pbox-notice">
          <i className="fa-solid fa-clock"></i>
          <span>
            <strong>Pending Approval:</strong> Your job will be reviewed by admin before publishing.
          </span>
        </div>

        <form onSubmit={handlePublishJob}>
          <div className="pbox-body-form">
            
            {error && (
              <div className="pbox-error">
                <i className="fa-solid fa-exclamation-circle"></i>
                {error}
              </div>
            )}

            {/* ── Job Title ── */}
            <div className="pb-group">
              <label>
                Job Title <span className="required-star">*</span>
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

            {/* ── Budget Section ── */}
            <div className="pb-group">
              <label>
                Budget <span className="required-star">*</span>
              </label>
              
              <div className="pb-radio-group">
                <label className="pb-radio-label">
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
                <label className="pb-radio-label">
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
                <div className="pb-budget-fixed">
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
                <div className="pb-budget-range">
                  <div className="pb-row-twin">
                    <div className="pb-group">
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
                    <div className="pb-group">
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

           
            

            {/* ── Deadline Section ── */}
            <div className="pb-group">
              <label>
                Deadline <span className="required-star">*</span>
              </label>
              
              <div className="pb-radio-group">
                <label className="pb-radio-label">
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
                <label className="pb-radio-label">
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
                <div className="pb-deadline-fixed">
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
                <div className="pb-deadline-range">
                  <div className="pb-row-twin">
                    <div className="pb-group">
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
                    <div className="pb-group">
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

            {/* ── Job Description ── */}
            <div className="pb-group">
              <label>
                Job Description <span className="required-star">*</span>
                <span className="char-count">{description.length}/5000</span>
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

          <div className="pbox-footer">
            <button 
              type="button" 
              className="pbox-btn pb-btn-close" 
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="reset" 
              className="pbox-btn pb-btn-reset" 
              onClick={handleReset}
              disabled={loading}
            >
              <i className="fa-solid fa-rotate"></i> Reset
            </button>
            <button 
              type="submit" 
              className="pbox-btn pb-btn-publish" 
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