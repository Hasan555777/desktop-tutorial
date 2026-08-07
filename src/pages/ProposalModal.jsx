// src/components/ProposalModal.jsx
import React, { useState, useEffect } from 'react';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import './ProposalModal.css';

const ProposalModal = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  initialData = {},
  title = "Send Work Proposal",
  submitLabel = "Send Proposal",
  loading: externalLoading = false
}) => {
  const [formData, setFormData] = useState({
    budget: initialData.budget || '',
    deadline: initialData.deadline || '',
    details: initialData.details || ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const feedback = useFeedback();

  // ============================================================
  // ✅ ফর্ম রিসেট (মোডাল খোলার সময়)
  // ============================================================
  useEffect(() => {
    if (isOpen) {
      setFormData({
        budget: initialData.budget || '',
        deadline: initialData.deadline || '',
        details: initialData.details || ''
      });
      setErrors({});
    }
  }, [isOpen, initialData]);

  // ============================================================
  // ✅ ইনপুট হ্যান্ডলার
  // ============================================================
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Error ক্লিয়ার করুন
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // ============================================================
  // ✅ ভ্যালিডেশন
  // ============================================================
  const validate = () => {
    const newErrors = {};
    
    if (!formData.budget || Number(formData.budget) < 100) {
      newErrors.budget = 'Minimum budget is 100 BDT';
    }
    if (Number(formData.budget) > 1000000) {
      newErrors.budget = 'Budget cannot exceed 1,000,000 BDT';
    }
    
    if (!formData.deadline || Number(formData.deadline) < 1) {
      newErrors.deadline = 'Minimum deadline is 1 day';
    }
    if (Number(formData.deadline) > 365) {
      newErrors.deadline = 'Deadline cannot exceed 365 days';
    }
    
    if (!formData.details || formData.details.trim().length < 20) {
      newErrors.details = 'Please provide at least 20 characters of details';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ============================================================
  // ✅ সাবমিট
  // ============================================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    setLoading(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error("Submit error:", error);
      feedback.showError('Error', 'Failed to send proposal: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
  return (
    <div className="proposal-modal-overlay" onClick={onClose}>
      <div className="proposal-modal-container" onClick={(e) => e.stopPropagation()}>
        
        {/* হেডার */}
        <div className="proposal-modal-header">
          <h3>
            <i className="fa-solid fa-file-signature" style={{ color: '#fbbf24' }}></i> 
            {title}
          </h3>
          <button className="proposal-modal-close" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="proposal-modal-body">
            
            {/* Budget */}
            <div className="proposal-form-group">
              <label>
                <i className="fa-solid fa-wallet"></i> 
                Proposed Budget (BDT) <span className="required-star">*</span>
              </label>
              <input
                type="number"
                name="budget"
                value={formData.budget}
                onChange={handleChange}
                placeholder="Enter budget amount (min: 100 BDT)"
                min="100"
                max="1000000"
                className={errors.budget ? 'input-error' : ''}
                required
              />
              {errors.budget && (
                <span className="error-text">{errors.budget}</span>
              )}
              <small className="input-hint">Min: 100 BDT • Max: 1,000,000 BDT</small>
            </div>

            {/* Deadline */}
            <div className="proposal-form-group">
              <label>
                <i className="fa-regular fa-calendar"></i> 
                Timeline (Days) <span className="required-star">*</span>
              </label>
              <input
                type="number"
                name="deadline"
                value={formData.deadline}
                onChange={handleChange}
                placeholder="Enter deadline in days"
                min="1"
                max="365"
                className={errors.deadline ? 'input-error' : ''}
                required
              />
              {errors.deadline && (
                <span className="error-text">{errors.deadline}</span>
              )}
              <small className="input-hint">Min: 1 day • Max: 365 days</small>
            </div>

            {/* Details */}
            <div className="proposal-form-group">
              <label>
                <i className="fa-solid fa-file-lines"></i> 
                Work Details <span className="required-star">*</span>
              </label>
              <textarea
                name="details"
                rows="5"
                value={formData.details}
                onChange={handleChange}
                placeholder="Describe what work will be done, deliverables, requirements..."
                className={errors.details ? 'input-error' : ''}
                maxLength="5000"
                required
              />
              {errors.details && (
                <span className="error-text">{errors.details}</span>
              )}
              <small className="char-count">{formData.details.length}/5000</small>
            </div>

          </div>

          {/* ফুটার */}
          <div className="proposal-modal-footer">
            <button 
              type="button" 
              className="proposal-btn-cancel" 
              onClick={onClose}
              disabled={loading || externalLoading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="proposal-btn-submit" 
              disabled={loading || externalLoading}
            >
              {loading || externalLoading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i> Sending...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-paper-plane"></i> {submitLabel}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProposalModal;