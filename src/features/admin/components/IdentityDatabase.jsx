// ============================================================
// 📁 src/pages/Admin/components/IdentityDatabase.jsx
// ============================================================
// Identity Database - Admin can manage all identity records
// Features: Auto-save from registration, Manual entry, Duplicate detection
//
// 🔧 FIX APPLIED (this revision):
// - saveRecord() imported hashIdentityNumber but never called it, so
//   manually-added records never got an `identityHash` field. Every
//   record auto-saved from the registration flow DOES set
//   identityHash (see useRegisterFlow.js's runIdentityDuplicateCheck),
//   and detectDuplicateIdentity() (utils/identityUtils.js) matches
//   against identityRecords by that hash — so manual entries were
//   silently invisible to future duplicate checks. Now saveRecord()
//   computes and stores identityHash for both new and edited records,
//   so manual and auto-added records are equally duplicate-checkable.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  orderBy, 
  serverTimestamp,
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from '../../../shared/firebase/index';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';
import { 
  maskIdentityNumber, 
  hashIdentityNumber, 
  detectDuplicateIdentity,
  updateIdentityRecordStatus,
  IDENTITY_STATUS
} from '../../profile/utils/identityUtils';
// import './IdentityDatabase.css';
import styles from './IdentityDatabase.module.css';


// ============================================================
// 📌 IMAGE ZOOM MODAL
// ============================================================

const ImageZoomModal = ({ imageUrl, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [onClose]);

  return (
    <div className="idb-zoom-modal" onClick={onClose}>
      <div className="idb-zoom-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="idb-zoom-close" onClick={onClose}>
          <i className="fa-solid fa-xmark"></i>
        </button>
        <img src={imageUrl} alt="Identity Document" />
      </div>
    </div>
  );
};

// ============================================================
// 📌 ADD/EDIT MODAL
// ============================================================

const IdentityFormModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  editingRecord,
  existingRecords 
}) => {
  const feedback = useFeedback();
  const [formData, setFormData] = useState({
    fullName: '',
    identityType: 'nid',
    identityNumber: '',
    phone: '',
    email: '',
    address: '',
    documentFront: null,
    documentBack: null,
    documentFrontPreview: '',
    documentBackPreview: '',
    notes: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [errors, setErrors] = useState({});
  
  const frontInputRef = useRef(null);
  const backInputRef = useRef(null);

  useEffect(() => {
    if (editingRecord) {
      setFormData({
        fullName: editingRecord.fullName || '',
        identityType: editingRecord.identityType || 'nid',
        identityNumber: editingRecord.identityNumber || '',
        phone: editingRecord.phone || '',
        email: editingRecord.email || '',
        address: editingRecord.address || '',
        documentFront: null,
        documentBack: null,
        documentFrontPreview: editingRecord.documentFront || '',
        documentBackPreview: editingRecord.documentBack || '',
        notes: editingRecord.notes || ''
      });
    } else {
      setFormData({
        fullName: '',
        identityType: 'nid',
        identityNumber: '',
        phone: '',
        email: '',
        address: '',
        documentFront: null,
        documentBack: null,
        documentFrontPreview: '',
        documentBackPreview: '',
        notes: ''
      });
    }
    setDuplicateWarning(null);
    setErrors({});
  }, [editingRecord, isOpen]);

  const checkDuplicate = useCallback((number) => {
    if (!number || number.trim().length < 4) {
      setDuplicateWarning(null);
      return;
    }

    const trimmed = number.trim();
    const existing = existingRecords.find(record => 
      record.identityNumber === trimmed && 
      record.id !== editingRecord?.id
    );

    if (existing) {
      setDuplicateWarning({
        message: `⚠️ এই আইডি নম্বরটি "${existing.fullName}" এর সাথে মিলছে!`,
        existingRecord: existing
      });
    } else {
      setDuplicateWarning(null);
    }
  }, [existingRecords, editingRecord]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    if (name === 'identityNumber') {
      checkDuplicate(value);
    }
  };

  const handleFileUpload = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, [type]: 'ফাইল সাইজ ৫MB এর বেশি হতে পারবে না!' }));
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!validTypes.includes(file.type)) {
      setErrors(prev => ({ ...prev, [type]: 'শুধুমাত্র JPEG, PNG, WebP ফাইল সমর্থিত!' }));
      return;
    }

    setErrors(prev => ({ ...prev, [type]: '' }));

    const reader = new FileReader();
    reader.onload = (e) => {
      setFormData(prev => ({
        ...prev,
        [type === 'front' ? 'documentFront' : 'documentBack']: file,
        [type === 'front' ? 'documentFrontPreview' : 'documentBackPreview']: e.target.result
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeFile = (type) => {
    setFormData(prev => ({
      ...prev,
      [type === 'front' ? 'documentFront' : 'documentBack']: null,
      [type === 'front' ? 'documentFrontPreview' : 'documentBackPreview']: ''
    }));
    if (type === 'front' && frontInputRef.current) frontInputRef.current.value = '';
    if (type === 'back' && backInputRef.current) backInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!formData.fullName.trim()) {
      setErrors({ fullName: 'নাম লিখুন!' });
      return;
    }
    if (!formData.identityNumber.trim()) {
      setErrors({ identityNumber: 'আইডি নম্বর লিখুন!' });
      return;
    }
    if (formData.identityNumber.trim().length < 6) {
      setErrors({ identityNumber: 'আইডি নম্বর কমপক্ষে ৬ ডিজিট হতে হবে!' });
      return;
    }
    if (!formData.documentFrontPreview && !editingRecord?.documentFront) {
      setErrors({ documentFront: 'ডকুমেন্টের সামনের ছবি আপলোড করুন!' });
      return;
    }

    setLoading(true);
    try {
      const trimmed = formData.identityNumber.trim();
      const existing = existingRecords.find(record => 
        record.identityNumber === trimmed && 
        record.id !== editingRecord?.id
      );

      if (existing) {
        const confirm = await feedback.confirm({
          title: '⚠️ ডুপ্লিকেট আইডি সতর্কতা',
          message: `এই আইডি নম্বরটি "${existing.fullName}" এর সাথে মিলছে!\n\nআপনি কি তবুও সংরক্ষণ করতে চান?`,
          variant: 'warning',
          confirmText: 'হ্যাঁ, সংরক্ষণ করুন',
          cancelText: 'বাতিল',
        });
        if (!confirm) {
          setLoading(false);
          return;
        }
      }

      await onSave(formData, editingRecord);
      onClose();
    } catch (error) {
      console.error('Save error:', error);
      setErrors({ submit: error.message || 'সংরক্ষণ করতে সমস্যা হয়েছে' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="idb-modal-overlay" onClick={onClose}>
      <div className="idb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="idb-modal-header">
          <h3>
            <i className="fa-solid fa-id-card"></i>
            {editingRecord ? '✏️ Edit Identity' : '➕ Add New Identity'}
          </h3>
          <button className="idb-modal-close" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="idb-modal-body">
          {duplicateWarning && (
            <div className="idb-duplicate-warning">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <div>
                <strong>{duplicateWarning.message}</strong>
                <p>আপনি কি তবুও সংরক্ষণ করতে চান? পরবর্তী ধাপে নিশ্চিত করতে হবে।</p>
              </div>
            </div>
          )}

          <div className="idb-form-grid">
            <div className="idb-form-group">
              <label>পূর্ণ নাম <span className="required">*</span></label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="আইডি কার্ডের নাম লিখুন"
                className={errors.fullName ? 'error' : ''}
              />
              {errors.fullName && <span className="idb-error">{errors.fullName}</span>}
            </div>

            <div className="idb-form-group">
              <label>আইডি টাইপ <span className="required">*</span></label>
              <select name="identityType" value={formData.identityType} onChange={handleChange}>
                <option value="nid">🪪 NID (জাতীয় পরিচয়পত্র)</option>
                <option value="birth_certificate">📄 Birth Certificate (জন্ম নিবন্ধন)</option>
                <option value="passport">🛂 Passport (পাসপোর্ট)</option>
              </select>
            </div>

            <div className="idb-form-group">
              <label>আইডি নম্বর <span className="required">*</span></label>
              <input
                type="text"
                name="identityNumber"
                value={formData.identityNumber}
                onChange={handleChange}
                placeholder="আইডি নম্বর লিখুন"
                className={errors.identityNumber ? 'error' : ''}
              />
              {errors.identityNumber && <span className="idb-error">{errors.identityNumber}</span>}
              <small className="idb-hint">কমপক্ষে ৬ ডিজিট/অক্ষর</small>
            </div>

            <div className="idb-form-group">
              <label>মোবাইল নম্বর</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="মোবাইল নম্বর"
              />
            </div>

            <div className="idb-form-group">
              <label>ইমেইল</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="ইমেইল ঠিকানা"
              />
            </div>

            <div className="idb-form-group">
              <label>ঠিকানা</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="বর্তমান ঠিকানা"
              />
            </div>

            <div className="idb-form-group full-width">
              <label>ডকুমেন্ট (সামনের অংশ) <span className="required">*</span></label>
              <div 
                className={`idb-upload-area ${formData.documentFrontPreview ? 'has-file' : ''}`}
                onClick={() => frontInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={frontInputRef}
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, 'front')}
                  style={{ display: 'none' }}
                />
                {formData.documentFrontPreview ? (
                  <div className="idb-upload-preview">
                    <img src={formData.documentFrontPreview} alt="Document Front" />
                    <button 
                      className="idb-upload-remove"
                      onClick={(e) => { e.stopPropagation(); removeFile('front'); }}
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ) : (
                  <div className="idb-upload-placeholder">
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    <span>সামনের ছবি আপলোড করুন</span>
                    <small>JPG, PNG, WebP (Max 5MB)</small>
                  </div>
                )}
              </div>
              {errors.documentFront && <span className="idb-error">{errors.documentFront}</span>}
            </div>

            <div className="idb-form-group full-width">
              <label>ডকুমেন্ট (পিছনের অংশ) <span className="optional">(ঐচ্ছিক)</span></label>
              <div 
                className={`idb-upload-area ${formData.documentBackPreview ? 'has-file' : ''}`}
                onClick={() => backInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={backInputRef}
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, 'back')}
                  style={{ display: 'none' }}
                />
                {formData.documentBackPreview ? (
                  <div className="idb-upload-preview">
                    <img src={formData.documentBackPreview} alt="Document Back" />
                    <button 
                      className="idb-upload-remove"
                      onClick={(e) => { e.stopPropagation(); removeFile('back'); }}
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ) : (
                  <div className="idb-upload-placeholder">
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    <span>পিছনের ছবি আপলোড করুন</span>
                    <small>JPG, PNG, WebP (Max 5MB)</small>
                  </div>
                )}
              </div>
            </div>

            <div className="idb-form-group full-width">
              <label>নোট</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="অতিরিক্ত তথ্য..."
                rows="2"
              />
            </div>
          </div>

          {errors.submit && (
            <div className="idb-form-error">
              <i className="fa-solid fa-circle-exclamation"></i>
              {errors.submit}
            </div>
          )}
        </div>

        <div className="idb-modal-footer">
          <button className="idb-btn-cancel" onClick={onClose}>
            বাতিল করুন
          </button>
          <button 
            className="idb-btn-save" 
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <><i className="fa-solid fa-spinner fa-spin"></i> সংরক্ষণ...</>
            ) : (
              <><i className="fa-solid fa-check"></i> সংরক্ষণ করুন</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 📌 MAIN COMPONENT
// ============================================================

const IdentityDatabase = () => {
  const feedback = useFeedback();
  
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');

  const stats = useMemo(() => ({
    total: records.length,
    nid: records.filter(r => r.identityType === 'nid').length,
    birth: records.filter(r => r.identityType === 'birth_certificate').length,
    passport: records.filter(r => r.identityType === 'passport').length,
    pending: records.filter(r => r.status === 'pending').length,
    approved: records.filter(r => r.status === 'approved' || r.status === 'verified').length,
    rejected: records.filter(r => r.status === 'rejected').length,
    duplicate: records.filter(r => r.status === 'duplicate' || r.isDuplicate).length,
    // 🔧 ADD: superseded = an older resubmission from the same user,
    // automatically replaced by a newer one - see identityUtils.js's
    // runIdentityDuplicateCheck for where this gets set.
    superseded: records.filter(r => r.status === 'superseded').length,
    autoAdded: records.filter(r => r.autoAdded === true).length
  }), [records]);

  const filteredRecords = useMemo(() => {
    let filtered = [...records];
    
    if (filter !== 'all') {
      filtered = filtered.filter(r => r.identityType === filter);
    }
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => {
        if (statusFilter === 'pending') return r.status === 'pending';
        if (statusFilter === 'approved') return r.status === 'approved' || r.status === 'verified';
        if (statusFilter === 'rejected') return r.status === 'rejected';
        if (statusFilter === 'duplicate') return r.status === 'duplicate' || r.isDuplicate;
        if (statusFilter === 'superseded') return r.status === 'superseded';
        if (statusFilter === 'auto') return r.autoAdded === true;
        if (statusFilter === 'manual') return r.autoAdded !== true;
        return true;
      });
    }
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(r =>
        r.fullName?.toLowerCase().includes(term) ||
        r.identityNumber?.includes(term) ||
        r.phone?.includes(term) ||
        r.email?.toLowerCase().includes(term) ||
        r.address?.toLowerCase().includes(term) ||
        r.userUniqueId?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [records, filter, statusFilter, searchTerm]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'identityRecords'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRecords(data);
    } catch (error) {
      console.error('Load records error:', error);
      await feedback.showError('❌ লোড ব্যর্থ', 'রেকর্ড লোড করতে সমস্যা হয়েছে');
    } finally {
      setLoading(false);
    }
  }, [feedback]);

  // 🔧 FIXED: now computes identityHash (via hashIdentityNumber) and
  // stores it alongside every record — new or edited — so manually
  // entered identities are just as duplicate-checkable as ones
  // auto-saved from the registration flow. Previously this field was
  // simply never written for manual entries.
  const saveRecord = useCallback(async (formData, editingRecord) => {
    try {
      const trimmedNumber = formData.identityNumber.trim();
      const identityHash = await hashIdentityNumber(trimmedNumber);

      const recordData = {
        fullName: formData.fullName.trim(),
        identityType: formData.identityType,
        identityNumber: trimmedNumber,
        identityHash: identityHash,
        phone: formData.phone || '',
        email: formData.email || '',
        address: formData.address || '',
        documentFront: formData.documentFrontPreview || editingRecord?.documentFront || '',
        documentBack: formData.documentBackPreview || editingRecord?.documentBack || '',
        notes: formData.notes || '',
        updatedAt: serverTimestamp()
      };

      const trimmed = formData.identityNumber.trim();
      const existing = records.find(r => 
        r.identityNumber === trimmed && 
        r.id !== editingRecord?.id
      );

      if (existing) {
        const confirm = await feedback.confirm({
          title: '⚠️ ডুপ্লিকেট আইডি সতর্কতা',
          message: `এই আইডি নম্বরটি "${existing.fullName}" এর সাথে মিলছে!\n\nআপনি কি তবুও সংরক্ষণ করতে চান?`,
          variant: 'warning',
          confirmText: 'হ্যাঁ, সংরক্ষণ করুন',
          cancelText: 'বাতিল',
        });
        if (!confirm) return;
      }

      if (editingRecord) {
        await updateDoc(doc(db, 'identityRecords', editingRecord.id), recordData);
        await feedback.showSuccess('✅ আপডেট করা হয়েছে', 'রেকর্ড সফলভাবে আপডেট করা হয়েছে!');
      } else {
        await addDoc(collection(db, 'identityRecords'), {
          ...recordData,
          autoAdded: false,
          status: 'pending',
          isDuplicate: !!existing,
          duplicateOf: existing?.id || null,
          createdAt: serverTimestamp()
        });
        await feedback.showSuccess('✅ যোগ করা হয়েছে', 'নতুন রেকর্ড সফলভাবে যোগ করা হয়েছে!');
      }
      
      await loadRecords();
    } catch (error) {
      console.error('Save record error:', error);
      await feedback.showError('❌ সংরক্ষণ ব্যর্থ', error.message || 'রেকর্ড সংরক্ষণ করতে সমস্যা হয়েছে');
      throw error;
    }
  }, [records, loadRecords, feedback]);

  const handleDelete = useCallback(async (recordId) => {
    try {
      await deleteDoc(doc(db, 'identityRecords', recordId));
      await feedback.showSuccess('🗑️ ডিলিট করা হয়েছে', 'রেকর্ড সফলভাবে ডিলিট করা হয়েছে!');
      await loadRecords();
    } catch (error) {
      console.error('Delete error:', error);
      await feedback.showError('❌ ডিলিট ব্যর্থ', error.message || 'রেকর্ড ডিলিট করতে সমস্যা হয়েছে');
    }
  }, [loadRecords, feedback]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedRecords.length === 0) return;
    
    const confirmed = await feedback.confirm({
      title: '🗑️ একাধিক রেকর্ড ডিলিট',
      message: `আপনি কি ${selectedRecords.length} টি রেকর্ড ডিলিট করতে চান?`,
      variant: 'delete',
      confirmText: 'হ্যাঁ, ডিলিট করুন',
      cancelText: 'বাতিল করুন'
    });
    
    if (!confirmed) return;
    
    try {
      const batch = writeBatch(db);
      selectedRecords.forEach(id => {
        batch.delete(doc(db, 'identityRecords', id));
      });
      await batch.commit();
      await feedback.showSuccess(`✅ ${selectedRecords.length} টি রেকর্ড ডিলিট করা হয়েছে`);
      setSelectedRecords([]);
      await loadRecords();
    } catch (error) {
      console.error('Bulk delete error:', error);
      await feedback.showError('❌ ব্যর্থ', 'ডিলিট করতে সমস্যা হয়েছে');
    }
  }, [selectedRecords, loadRecords, feedback]);

  // ✅ Approve Record
  const handleApprove = useCallback(async (recordId) => {
    const confirmed = await feedback.confirm({
      title: '✅ Approve Identity',
      message: 'আপনি কি এই আইডেন্টিটি অ্যাপ্রুভ করতে চান?',
      variant: 'confirm',
      confirmText: 'হ্যাঁ, Approve করুন',
      cancelText: 'বাতিল করুন'
    });
    
    if (!confirmed) return;
    
    try {
      const result = await updateIdentityRecordStatus(recordId, 'approved', {
        approvedAt: serverTimestamp(),
        approvedBy: 'admin'
      });
      
      if (result.success) {
        const record = records.find(r => r.id === recordId);
        if (record?.userId) {
          await addDoc(collection(db, 'notifications'), {
            userId: record.userId,
            message: '✅ আপনার আইডেন্টিটি অ্যাপ্রুভ করা হয়েছে!',
            type: 'success',
            isUnread: true,
            createdAt: serverTimestamp()
          });
        }
        await feedback.showSuccess('✅ অ্যাপ্রুভ করা হয়েছে', 'আইডেন্টিটি সফলভাবে অ্যাপ্রুভ করা হয়েছে!');
        await loadRecords();
      }
    } catch (error) {
      await feedback.showError('❌ ব্যর্থ', error.message);
    }
  }, [feedback, loadRecords, records]);

  // ✅ Reject Record
  const handleReject = useCallback(async (recordId) => {
    const reason = window.prompt('রিজেক্ট করার কারণ লিখুন:');
    if (reason === null) return;
    
    const confirmed = await feedback.confirm({
      title: '❌ Reject Identity',
      message: `আপনি কি এই আইডেন্টিটি রিজেক্ট করতে চান?\n\nকারণ: ${reason || 'No reason'}`,
      variant: 'delete',
      confirmText: 'হ্যাঁ, Reject করুন',
      cancelText: 'বাতিল করুন'
    });
    
    if (!confirmed) return;
    
    try {
      const result = await updateIdentityRecordStatus(recordId, 'rejected', {
        rejectReason: reason || 'No reason provided',
        rejectedAt: serverTimestamp(),
        rejectedBy: 'admin'
      });
      
      if (result.success) {
        const record = records.find(r => r.id === recordId);
        if (record?.userId) {
          await addDoc(collection(db, 'notifications'), {
            userId: record.userId,
            message: `❌ আপনার আইডেন্টিটি রিজেক্ট করা হয়েছে।\nকারণ: ${reason || 'No reason'}`,
            type: 'error',
            isUnread: true,
            createdAt: serverTimestamp()
          });
        }
        await feedback.showWarning('❌ রিজেক্ট করা হয়েছে', 'আইডেন্টিটি রিজেক্ট করা হয়েছে!');
        await loadRecords();
      }
    } catch (error) {
      await feedback.showError('❌ ব্যর্থ', error.message);
    }
  }, [feedback, loadRecords, records]);

  // ✅ Resolve Duplicate
  const handleResolveDuplicate = useCallback(async (recordId) => {
    const targetId = window.prompt('ডুপ্লিকেট রিজলভ করার জন্য Target User ID দিন:');
    if (!targetId) return;
    
    const confirmed = await feedback.confirm({
      title: '🔗 Resolve Duplicate',
      message: `আপনি কি এই ডুপ্লিকেট রিজলভ করতে চান?\n\nTarget User ID: ${targetId}`,
      variant: 'confirm',
      confirmText: 'হ্যাঁ, Resolve করুন',
      cancelText: 'বাতিল করুন'
    });
    
    if (!confirmed) return;
    
    try {
      await updateDoc(doc(db, 'identityRecords', recordId), {
        status: 'approved',
        duplicateResolved: true,
        duplicateResolvedTo: targetId,
        duplicateResolvedAt: serverTimestamp(),
        duplicateResolvedBy: 'admin'
      });
      
      await feedback.showSuccess('✅ ডুপ্লিকেট রিজলভ করা হয়েছে', '');
      await loadRecords();
    } catch (error) {
      await feedback.showError('❌ ব্যর্থ', error.message);
    }
  }, [feedback, loadRecords]);

  const toggleSelect = (id) => {
    setSelectedRecords(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedRecords.length === filteredRecords.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(filteredRecords.map(r => r.id));
    }
  };

  const exportCSV = useCallback(() => {
    const headers = ['নাম', 'আইডি টাইপ', 'আইডি নম্বর', 'মোবাইল', 'ইমেইল', 'ঠিকানা', 'স্ট্যাটাস', 'অটো', 'তারিখ'];
    const rows = filteredRecords.map(r => [
      r.fullName,
      r.identityType === 'nid' ? 'NID' : r.identityType === 'birth_certificate' ? 'জন্ম নিবন্ধন' : 'পাসপোর্ট',
      r.identityNumber,
      r.phone || '',
      r.email || '',
      r.address || '',
      r.status || 'pending',
      r.autoAdded ? 'হ্যাঁ' : 'না',
      r.createdAt?.toDate?.()?.toLocaleDateString() || ''
    ]);
    
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `identity-records-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRecords]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  if (loading) {
    return (
      <div className="idb-loading">
        <div className="idb-loading-spinner"></div>
        <p>Loading Identity Database...</p>
      </div>
    );
  }
return (
    <div className={styles.identityDatabase}>
      {/* ── Header ── */}
      <div className={styles.idbHeader}>
        <div className={styles.idbHeaderLeft}>
          <h2>
            <i className="fa-solid fa-database"></i>
            Identity Database
            <span className={styles.idbBadge}>{stats.total}</span>
            {stats.autoAdded > 0 && (
              <span className={`${styles.idbBadge} ${styles.auto}`}>🤖 {stats.autoAdded} Auto</span>
            )}
          </h2>
        </div>
        <div className={styles.idbHeaderRight}>
          <button className={styles.idbBtnExport} onClick={exportCSV}>
            <i className="fa-solid fa-file-export"></i> Export CSV
          </button>
          <button className={styles.idbBtnAdd} onClick={() => { setEditingRecord(null); setShowForm(true); }}>
            <i className="fa-solid fa-plus"></i> Add New
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className={styles.idbStats}>
        <div className={styles.idbStat}>
          <span className={styles.idbStatValue}>{stats.total}</span>
          <span className={styles.idbStatLabel}>Total</span>
        </div>
        <div className={`${styles.idbStat} ${styles.nid}`}>
          <span className={styles.idbStatValue}>{stats.nid}</span>
          <span className={styles.idbStatLabel}>🪪 NID</span>
        </div>
        <div className={`${styles.idbStat} ${styles.birth}`}>
          <span className={styles.idbStatValue}>{stats.birth}</span>
          <span className={styles.idbStatLabel}>📄 Birth</span>
        </div>
        <div className={`${styles.idbStat} ${styles.passport}`}>
          <span className={styles.idbStatValue}>{stats.passport}</span>
          <span className={styles.idbStatLabel}>🛂 Passport</span>
        </div>
        <div className={`${styles.idbStat} ${styles.pending}`}>
          <span className={styles.idbStatValue}>{stats.pending}</span>
          <span className={styles.idbStatLabel}>⏳ Pending</span>
        </div>
        <div className={`${styles.idbStat} ${styles.approved}`}>
          <span className={styles.idbStatValue}>{stats.approved}</span>
          <span className={styles.idbStatLabel}>✅ Approved</span>
        </div>
        <div className={`${styles.idbStat} ${styles.duplicate}`}>
          <span className={styles.idbStatValue}>{stats.duplicate}</span>
          <span className={styles.idbStatLabel}>🚫 Duplicate</span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className={styles.idbFilters}>
        <div className={styles.idbFilterGroup}>
          <button 
            className={`${styles.idbFilterBtn} ${filter === 'all' ? styles.active : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({stats.total})
          </button>
          <button 
            className={`${styles.idbFilterBtn} ${filter === 'nid' ? styles.active : ''}`}
            onClick={() => setFilter('nid')}
          >
            🪪 NID ({stats.nid})
          </button>
          <button 
            className={`${styles.idbFilterBtn} ${filter === 'birth_certificate' ? styles.active : ''}`}
            onClick={() => setFilter('birth_certificate')}
          >
            📄 Birth ({stats.birth})
          </button>
          <button 
            className={`${styles.idbFilterBtn} ${filter === 'passport' ? styles.active : ''}`}
            onClick={() => setFilter('passport')}
          >
            🛂 Passport ({stats.passport})
          </button>
        </div>
        
        <div className={styles.idbFilterGroup}>
          <button 
            className={`${styles.idbFilterBtn} ${statusFilter === 'all' ? styles.active : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All Status
          </button>
          <button 
            className={`${styles.idbFilterBtn} ${statusFilter === 'pending' ? styles.active : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            ⏳ Pending ({stats.pending})
          </button>
          <button 
            className={`${styles.idbFilterBtn} ${statusFilter === 'approved' ? styles.active : ''}`}
            onClick={() => setStatusFilter('approved')}
          >
            ✅ Approved ({stats.approved})
          </button>
          <button 
            className={`${styles.idbFilterBtn} ${statusFilter === 'rejected' ? styles.active : ''}`}
            onClick={() => setStatusFilter('rejected')}
          >
            ❌ Rejected ({stats.rejected})
          </button>
          <button 
            className={`${styles.idbFilterBtn} ${statusFilter === 'duplicate' ? styles.active : ''}`}
            onClick={() => setStatusFilter('duplicate')}
          >
            🚫 Duplicate ({stats.duplicate})
          </button>
          <button 
            className={`${styles.idbFilterBtn} ${statusFilter === 'superseded' ? styles.active : ''}`}
            onClick={() => setStatusFilter('superseded')}
          >
            🔄 Superseded ({stats.superseded})
          </button>
          <button 
            className={`${styles.idbFilterBtn} ${statusFilter === 'auto' ? styles.active : ''}`}
            onClick={() => setStatusFilter('auto')}
          >
            🤖 Auto ({stats.autoAdded})
          </button>
          <button 
            className={`${styles.idbFilterBtn} ${statusFilter === 'manual' ? styles.active : ''}`}
            onClick={() => setStatusFilter('manual')}
          >
            ✋ Manual ({stats.total - stats.autoAdded})
          </button>
        </div>
        
        <div className={styles.idbSearch}>
          <i className="fa-solid fa-search"></i>
          <input
            type="text"
            placeholder="Search by name, ID, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className={styles.idbSearchClear} onClick={() => setSearchTerm('')}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>
      </div>

      {/* ── Bulk Actions ── */}
      {selectedRecords.length > 0 && (
        <div className={styles.idbBulkActions}>
          <span>{selectedRecords.length} selected</span>
          <button className={styles.idbBulkDelete} onClick={handleBulkDelete}>
            <i className="fa-solid fa-trash"></i> Delete Selected
          </button>
          <button className={styles.idbBulkClear} onClick={() => setSelectedRecords([])}>
            Clear Selection
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className={styles.idbTableWrapper}>
        <table className={styles.idbTable}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selectedRecords.length === filteredRecords.length && filteredRecords.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Name</th>
              <th>ID Type</th>
              <th>ID Number</th>
              <th>Contact</th>
              <th>Document</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan="8" className={styles.idbEmpty}>
                  <i className="fa-solid fa-database"></i>
                  <p>No records found</p>
                  <button className={styles.idbBtnAddSmall} onClick={() => { setEditingRecord(null); setShowForm(true); }}>
                    <i className="fa-solid fa-plus"></i> Add First Record
                  </button>
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => (
                <tr key={record.id} className={selectedRecords.includes(record.id) ? styles.selected : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedRecords.includes(record.id)}
                      onChange={() => toggleSelect(record.id)}
                    />
                  </td>
                  <td>
                    <div className={styles.idbUserInfo}>
                      <div className={styles.idbUserName}>{record.fullName}</div>
                      {record.address && (
                        <div className={styles.idbUserAddress}>{record.address}</div>
                      )}
                      {record.autoAdded && (
                        <span className={styles.idbAutoBadge}>
                          <i className="fa-solid fa-robot"></i> Auto
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.idbTypeBadge} ${styles[record.identityType]}`}>
                      {record.identityType === 'nid' ? '🪪 NID' : 
                       record.identityType === 'birth_certificate' ? '📄 Birth' : '🛂 Passport'}
                    </span>
                  </td>
                  <td>
                    <span className={styles.idbIdNumber}>{record.identityNumber}</span>
                  </td>
                  <td>
                    {record.phone && <div className={styles.idbContact}>{record.phone}</div>}
                    {record.email && <div className={`${styles.idbContact} ${styles.small}`}>{record.email}</div>}
                  </td>
                  <td>
                    {record.documentFront && (
                      <button 
                        className={styles.idbDocBtn}
                        onClick={() => setZoomedImage(record.documentFront)}
                        title="View Document"
                      >
                        <i className="fa-solid fa-image"></i> View
                      </button>
                    )}
                    {record.documentBack && (
                      <button 
                        className={`${styles.idbDocBtn} ${styles.secondary}`}
                        onClick={() => setZoomedImage(record.documentBack)}
                        title="View Back"
                      >
                        <i className="fa-solid fa-image"></i> Back
                      </button>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.idbStatus} ${styles[record.status || 'pending']}`}>
                      {record.status === 'approved' || record.status === 'verified' ? '✅ Approved' : 
                       record.status === 'rejected' ? '❌ Rejected' : 
                       record.status === 'duplicate' ? '🚫 Duplicate' :
                       record.status === 'superseded' ? '🔄 Superseded (newer submission exists)' :
                       '⏳ Pending'}
                    </span>
                  </td>
                  <td>
                    <div className={styles.idbActions}>
                      {(record.status === 'pending' || record.status === 'duplicate') && (
                        <>
                          <button 
                            className={styles.idbActionApprove} 
                            onClick={() => handleApprove(record.id)}
                            title="Approve"
                          >
                            ✅
                          </button>
                          <button 
                            className={styles.idbActionReject} 
                            onClick={() => handleReject(record.id)}
                            title="Reject"
                          >
                            ❌
                          </button>
                        </>
                      )}
                      {record.status === 'duplicate' && (
                        <button 
                          className={styles.idbActionFlag} 
                          onClick={() => handleResolveDuplicate(record.id)}
                          title="Resolve Duplicate"
                        >
                          🔗
                        </button>
                      )}
                      <button 
                        className={styles.idbActionEdit} 
                        onClick={() => { setEditingRecord(record); setShowForm(true); }}
                        title="Edit"
                      >
                        <i className="fa-solid fa-pen"></i>
                      </button>
                      <button 
                        className={styles.idbActionDelete} 
                        onClick={async () => {
                          const confirmed = await feedback.confirm({
                            title: 'নিশ্চিত করুন',
                            message: `"${record.fullName}" ডিলিট করতে চান?`,
                            variant: 'error',
                            confirmText: 'ডিলিট করুন',
                            cancelText: 'বাতিল',
                          });
                          if (confirmed) {
                            handleDelete(record.id);
                          }
                        }}
                        title="Delete"
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      <div className={styles.idbFooter}>
        <span>
          Showing <strong>{filteredRecords.length}</strong> of <strong>{records.length}</strong> records
          {stats.autoAdded > 0 && (
            <span className={styles.idbFooterInfo}>
              • 🤖 {stats.autoAdded} auto-saved from registration
            </span>
          )}
        </span>
        <button className={styles.idbBtnRefresh} onClick={loadRecords}>
          <i className="fa-solid fa-sync"></i> Refresh
        </button>
      </div>

      {/* ── Form Modal ── */}
      <IdentityFormModal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingRecord(null); }}
        onSave={saveRecord}
        editingRecord={editingRecord}
        existingRecords={records}
      />

      {/* ── Image Zoom Modal ── */}
      {zoomedImage && (
        <ImageZoomModal 
          imageUrl={zoomedImage} 
          onClose={() => setZoomedImage(null)} 
        />
      )}
    </div>
  );
};

export default IdentityDatabase;