// src/components/PostServiceBox/PostServiceBox.jsx

import React, { useState, useRef } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../shared/firebase/index';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import styles from './PostServiceBox.module.css';


function PostServiceBox({ onClose, setActiveTab, onSilentPost, currentUser }) {
  const feedback = useFeedback();
  
  const [serviceTitle, setServiceTitle] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  
  // ✅ New States for Price & Delivery Rules
  const [priceType, setPriceType] = useState('fixed'); // 'fixed' or 'range'
  const [deliveryType, setDeliveryType] = useState('fixed'); // 'fixed' or 'range'
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minDelivery, setMinDelivery] = useState('');
  const [maxDelivery, setMaxDelivery] = useState('');
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [showPriceRange, setShowPriceRange] = useState(false);
  const [showDeliveryRange, setShowDeliveryRange] = useState(false);
  
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  usePageLoadingBar(loading); // 🔧 ADD (#25 loading consistency)
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);
  
  const isSubmitting = useRef(false);
  const lastSubmitTime = useRef(0);

  const CLOUD_NAME = "drwex6tmf";
  const UPLOAD_PRESET = "workhub_preset";

  // ── Price Options ──
  const PRICE_OPTIONS = {
    min: 100,
    max: 1000000,
    step: 100
  };

  // ── Delivery Options ──
  const DELIVERY_OPTIONS = {
    min: 1,
    max: 365,
    step: 1
  };

  // ============================================================
  // ✅ ইমেজ কম্প্রেশন ও রিসাইজ ফাংশন
  // ============================================================
  const compressImage = (file, maxWidth = 800, maxHeight = 600, quality = 0.7) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Canvas to Blob failed'));
                return;
              }
              
              const originalSize = file.size / 1024;
              const compressedSize = blob.size / 1024;
              const compressionRatio = Math.round((compressedSize / originalSize) * 100);
              
              console.log(`📊 Image compression: ${originalSize.toFixed(1)}KB → ${compressedSize.toFixed(1)}KB (${compressionRatio}%)`);
              
              const compressedFile = new File(
                [blob], 
                file.name.replace(/\.[^.]+$/, '.jpg'), 
                { type: 'image/jpeg', lastModified: Date.now() }
              );
              
              resolve(compressedFile);
            },
            'image/jpeg',
            quality
          );
        };
        
        img.onerror = () => {
          reject(new Error('Failed to load image'));
        };
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
    });
  };

  // ============================================================
  // ✅ মাল্টিপল ইমেজ কম্প্রেস
  // ============================================================
  const compressMultipleImages = async (files) => {
    const compressionPromises = files.map(async (file) => {
      try {
        if (file.size < 100 * 1024) {
          console.log(`✅ ${file.name} is already small (${(file.size/1024).toFixed(1)}KB), skipping compression`);
          return file;
        }
        return await compressImage(file, 800, 600, 0.7);
      } catch (error) {
        console.error(`❌ Error compressing ${file.name}:`, error);
        return file;
      }
    });
    
    return await Promise.all(compressionPromises);
  };

  // ============================================================
  // ✅ Cloudinary আপলোড
  // ============================================================
  const uploadToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { 
        method: "POST", 
        body: formData 
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || 'Upload failed');
      }
      
      const data = await res.json();
      return data.secure_url;
    } catch (error) {
      console.error("Upload Error:", error);
      throw error;
    }
  };

  // ============================================================
  // ✅ ইমেজ হ্যান্ডলার (২ টা পিক বাধ্যতামূলক)
  // ============================================================
  const handleImageChange = async (e) => {
    setError('');
    const files = Array.from(e.target.files);
    
    const remainingSlots = 2 - selectedImages.length;
    
    if (selectedImages.length >= 2) {
      setError("⚠️ You already have 2 images. Remove one to add a new one.");
      if (fileInputRef.current) fileInputRef.current.value = ''; 
      return;
    }

    if (files.length > remainingSlots) {
      setError(`⚠️ You can upload ${remainingSlots} more image${remainingSlots > 1 ? 's' : ''} (exactly 2 required)`);
      if (fileInputRef.current) fileInputRef.current.value = ''; 
      return;
    }

    const validFiles = [];
    const validPreviews = [];
    
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`${file.name} is larger than 10MB!`);
        continue;
      }
      if (!file.type.startsWith('image/')) {
        setError(`${file.name} is not an image!`);
        continue;
      }
      
      validPreviews.push(URL.createObjectURL(file));
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setLoading(true);
    setUploadProgress(0);
    
    try {
      console.log("🔄 Compressing images...");
      const compressedFiles = await compressMultipleImages(validFiles);
      
      const compressedPreviews = await Promise.all(
        compressedFiles.map((file) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
          });
        })
      );
      
      setSelectedImages(prev => [...prev, ...compressedFiles]);
      setImagePreviews(prev => [...prev, ...compressedPreviews]);
      setUploadProgress(100);
      
      console.log(`✅ ${compressedFiles.length} images compressed successfully!`);
      
    } catch (error) {
      console.error("❌ Compression error:", error);
      setSelectedImages(prev => [...prev, ...validFiles]);
      setImagePreviews(prev => [...prev, ...validPreviews]);
      setError("⚠️ Image compression failed, using original files.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ✅ রিমুভ ইমেজ - ফিক্সড
  const handleRemoveImage = (index) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
    const previewToRemove = imagePreviews[index];
    if (previewToRemove && previewToRemove.startsWith('blob:')) {
      URL.revokeObjectURL(previewToRemove);
    }
    setError('');
  };

  // ============================================================
  // ✅ ফর্ম ভ্যালিডেশন
  // ============================================================
  const validateForm = () => {
    if (!serviceTitle.trim()) {
      setError('Please enter a service title');
      return false;
    }
    if (serviceTitle.trim().length < 5) {
      setError('Service title must be at least 5 characters');
      return false;
    }

    if (!description.trim()) {
      setError('Please enter a service description');
      return false;
    }
    if (description.trim().length < 20) {
      setError('Description must be at least 20 characters');
      return false;
    }

    // ── Price Validation ──
    if (priceType === 'fixed') {
      if (!price || Number(price) < PRICE_OPTIONS.min) {
        setError(`Price must be at least ${PRICE_OPTIONS.min} BDT`);
        return false;
      }
      if (Number(price) > PRICE_OPTIONS.max) {
        setError(`Price cannot exceed ${PRICE_OPTIONS.max.toLocaleString()} BDT`);
        return false;
      }
    } else {
      if (!minPrice || Number(minPrice) < PRICE_OPTIONS.min) {
        setError(`Minimum price must be at least ${PRICE_OPTIONS.min} BDT`);
        return false;
      }
      if (!maxPrice || Number(maxPrice) > PRICE_OPTIONS.max) {
        setError(`Maximum price cannot exceed ${PRICE_OPTIONS.max.toLocaleString()} BDT`);
        return false;
      }
      if (Number(minPrice) > Number(maxPrice)) {
        setError('Minimum price cannot be greater than maximum price');
        return false;
      }
      if (Number(maxPrice) - Number(minPrice) < 100) {
        setError('Price range must be at least 100 BDT apart');
        return false;
      }
    }

    // ── Delivery Validation ──
    if (deliveryType === 'fixed') {
      if (!deliveryDays || Number(deliveryDays) < DELIVERY_OPTIONS.min) {
        setError(`Delivery time must be at least ${DELIVERY_OPTIONS.min} day`);
        return false;
      }
      if (Number(deliveryDays) > DELIVERY_OPTIONS.max) {
        setError(`Delivery time cannot exceed ${DELIVERY_OPTIONS.max} days`);
        return false;
      }
    } else {
      if (!minDelivery || Number(minDelivery) < DELIVERY_OPTIONS.min) {
        setError(`Minimum delivery time must be at least ${DELIVERY_OPTIONS.min} day`);
        return false;
      }
      if (!maxDelivery || Number(maxDelivery) > DELIVERY_OPTIONS.max) {
        setError(`Maximum delivery time cannot exceed ${DELIVERY_OPTIONS.max} days`);
        return false;
      }
      if (Number(minDelivery) > Number(maxDelivery)) {
        setError('Minimum delivery cannot be greater than maximum delivery');
        return false;
      }
      if (Number(maxDelivery) - Number(minDelivery) < 1) {
        setError('Delivery range must be at least 1 day apart');
        return false;
      }
    }

    // ── Negotiable Validation (বাধ্যতামূলক) ──
    if (isNegotiable === null || isNegotiable === undefined) {
      setError('Please specify if the price is negotiable or not');
      return false;
    }

    // ✅ ২ টা পিক বাধ্যতামূলক
    if (selectedImages.length !== 2) {
      setError('Please upload exactly 2 images (2 images are required)');
      return false;
    }

    return true;
  };

  // ============================================================
  // ✅ ফর্ম সাবমিট
  // ============================================================
  const handlePublishService = async (e) => {
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
      setError("Please login to post a service!");
      return;
    }
    
    if (!validateForm()) {
      return;
    }

    isSubmitting.current = true;
    setLoading(true);
    lastSubmitTime.current = now;
    setUploadProgress(0);

    try {
      // ── Prepare Price Data ──
      let priceData = {};
      if (priceType === 'fixed') {
        priceData = {
          type: 'fixed',
          amount: Number(price),
          isNegotiable: isNegotiable
        };
      } else {
        priceData = {
          type: 'range',
          min: Number(minPrice),
          max: Number(maxPrice),
          isNegotiable: isNegotiable
        };
      }

      // ── Prepare Delivery Data ──
      let deliveryData = {};
      if (deliveryType === 'fixed') {
        deliveryData = {
          type: 'fixed',
          days: Number(deliveryDays)
        };
      } else {
        deliveryData = {
          type: 'range',
          min: Number(minDelivery),
          max: Number(maxDelivery)
        };
      }

      // ── Upload Images ──
      const uploadedImageUrls = [];
      let progress = 0;
      const totalImages = selectedImages.length;
      
      for (let i = 0; i < selectedImages.length; i++) {
        const file = selectedImages[i];
        console.log(`📤 Uploading image ${i+1}/${totalImages}: ${file.name} (${(file.size/1024).toFixed(1)}KB)`);
        
        const url = await uploadToCloudinary(file);
        if (url) {
          uploadedImageUrls.push(url);
          progress = Math.round(((i + 1) / totalImages) * 100);
          setUploadProgress(progress);
          console.log(`✅ Image ${i+1} uploaded`);
        } else {
          throw new Error(`Failed to upload image ${i+1}`);
        }
      }

      if (uploadedImageUrls.length === 0) {
        setError("Failed to upload images. Please try again.");
        return;
      }

      const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const serviceData = {
        type: 'service',
        mode: 'freelancer',
        title: serviceTitle.trim(),
        description: description.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: 'pending',
        userId: currentUser.uid,
        buyerId: null,
        sellerId: currentUser.uid,
        clientName: currentUser.displayName || currentUser.email?.split('@')[0] || "Service Provider",
        clientPhoto: currentUser.photoURL || null,
        clientEmail: currentUser.email,
        verified: false,
        proposals: 0,
        images: uploadedImageUrls,
        _uniqueId: uniqueId,
        
        // ✅ JobCard-এ চিনতে পারার জন্য budget & deadline
        budget: priceData,
        deadline: deliveryData,
        isNegotiable: isNegotiable,
        
        // ✅ পুরানো ফিল্ডও রাখুন (backward compatibility)
        price: priceData,
        delivery: deliveryData,
        
        editStatus: null,
        pendingChanges: null,
        editSubmittedAt: null,
        editApprovedAt: null,
        editRejectedAt: null,
        editRejectReason: null,
        approvedAt: null,
        approvedBy: null,
        rejectedAt: null,
        rejectedBy: null,
        rejectReason: null
      };

      console.log("📤 Publishing Service with price rules:", priceData);
      
      const postRef = doc(db, 'posts', uniqueId);
      await setDoc(postRef, serviceData);
      
      console.log("✅ Service posted with ID:", uniqueId);

      feedback.showSuccess(
        '✅ Service Submitted!',
        'Your service has been submitted for admin approval. It will be published once approved.',
        'SERVICE_SUBMITTED'
      );

      if (currentUser?.uid) {
        try {
          await addDoc(collection(db, 'notifications'), {
            userId: currentUser.uid,
            type: 'service_submitted',
            title: '📝 Service Submitted for Approval',
            message: `Your service "${serviceTitle.trim()}" is pending admin approval. You will be notified once it's approved.`,
            isUnread: true,
            createdAt: serverTimestamp()
          });
        } catch (notifError) {
          console.error('Notification error:', notifError);
        }
      }
      
      resetForm();
      
      if (setActiveTab) setActiveTab('dashboard');
      if (onClose) onClose();
      
    } catch (error) {
      console.error("❌ Upload Error:", error);
      setError('Failed to post service: ' + error.message);
      
      feedback.showError(
        '❌ Failed to Post',
        error.message || 'Something went wrong. Please try again.',
        'SERVICE_ERROR'
      );
    } finally {
      setLoading(false);
      setUploadProgress(0);
      setTimeout(() => {
        isSubmitting.current = false;
      }, 1000);
    }
  };

  // ============================================================
  // ✅ ফর্ম রিসেট
  // ============================================================
  const resetForm = () => {
    setServiceTitle('');
    setDeliveryDays('');
    setDescription('');
    setPrice('');
    setMinPrice('');
    setMaxPrice('');
    setMinDelivery('');
    setMaxDelivery('');
    setPriceType('fixed');
    setDeliveryType('fixed');
    setIsNegotiable(false);
    setShowPriceRange(false);
    setShowDeliveryRange(false);
    imagePreviews.forEach(preview => {
      if (preview && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview);
      }
    });
    setSelectedImages([]);
    setImagePreviews([]);
    setError('');
    setUploadProgress(0);
  };

  // ✅ ২ টা পিক না থাকলে submit disabled
  const isButtonDisabled = selectedImages.length < 2 || loading;

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
 return (
    <div className={styles.globalModalOverlay} onClick={onClose}>
      <div className={styles.postAddBox} onClick={(e) => e.stopPropagation()}>
        
        <div className={styles.pboxHeader}>
          <h3>
            <i className="fa-solid fa-laptop-code" style={{ color: '#fbbf24' }}></i> 
            Create a New Service Gig
          </h3>
          <button type="button" className={styles.pboxCloseBtn} onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Pending Status Notice */}
        <div className={styles.pboxNotice}>
          <i className="fa-solid fa-clock"></i>
          <span>
            <strong>Pending Approval:</strong> Your service will be reviewed by admin before publishing.
          </span>
        </div>

        {/* Upload Progress Bar */}
        {loading && uploadProgress > 0 && uploadProgress < 100 && (
          <div className={styles.uploadProgressBar}>
            <div className={styles.progressText}>Uploading images... {uploadProgress}%</div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }}></div>
            </div>
          </div>
        )}

        <form onSubmit={handlePublishService}>
          <div className={styles.pboxBodyForm}>
            
            {error && (
              <div className={styles.pboxError}>
                <i className="fa-solid fa-exclamation-circle"></i>
                {error}
              </div>
            )}

            {/* Size Indicator */}
            {selectedImages.length > 0 && (
              <div className={styles.imageSizeInfo}>
                <i className="fa-solid fa-circle-info"></i>
                <span>
                  Total size: {(selectedImages.reduce((acc, file) => acc + file.size, 0) / 1024).toFixed(1)} KB 
                  ({selectedImages.length} images)
                </span>
                <span className={styles.sizeBadge}>
                  <i className="fa-solid fa-check-circle" style={{ color: '#10b981' }}></i>
                  Optimized
                </span>
              </div>
            )}

            {/* Service Title */}
            <div className={styles.pbGroup}>
              <label>
                Service Title <span className={styles.requiredStar}>*</span>
              </label>
              <input 
                type="text" 
                value={serviceTitle}
                onChange={(e) => setServiceTitle(e.target.value)}
                placeholder="e.g., I will build a responsive React Website" 
                required 
                disabled={loading}
              />
              <small>Minimum 5 characters</small>
            </div>

            {/* Price Section */}
            <div className={styles.pbGroup}>
              <label>
                Price <span className={styles.requiredStar}>*</span>
              </label>
              
              <div className={styles.pbRadioGroup}>
                <label className={styles.pbRadioLabel}>
                  <input
                    type="radio"
                    name="priceType"
                    value="fixed"
                    checked={priceType === 'fixed'}
                    onChange={() => {
                      setPriceType('fixed');
                      setShowPriceRange(false);
                      setMinPrice('');
                      setMaxPrice('');
                    }}
                    disabled={loading}
                  />
                  Fixed Price
                </label>
                <label className={styles.pbRadioLabel}>
                  <input
                    type="radio"
                    name="priceType"
                    value="range"
                    checked={priceType === 'range'}
                    onChange={() => {
                      setPriceType('range');
                      setShowPriceRange(true);
                      setPrice('');
                    }}
                    disabled={loading}
                  />
                  Range (Negotiable)
                </label>
              </div>

              {priceType === 'fixed' ? (
                <div className={styles.pbPriceFixed}>
                  <input 
                    type="number" 
                    value={price} 
                    onChange={(e) => setPrice(e.target.value)} 
                    placeholder={`e.g., 5000 (Min: ${PRICE_OPTIONS.min})`} 
                    min={PRICE_OPTIONS.min} 
                    max={PRICE_OPTIONS.max}
                    step={PRICE_OPTIONS.step}
                    disabled={loading}
                  />
                  <small>
                    Min: {PRICE_OPTIONS.min.toLocaleString()} BDT • 
                    Max: {PRICE_OPTIONS.max.toLocaleString()} BDT
                  </small>
                </div>
              ) : (
                <div className={styles.pbPriceRange}>
                  <div className={styles.pbRowTwin}>
                    <div className={styles.pbGroup}>
                      <label>Min Price</label>
                      <input 
                        type="number" 
                        value={minPrice} 
                        onChange={(e) => setMinPrice(e.target.value)} 
                        placeholder={`Min: ${PRICE_OPTIONS.min}`} 
                        min={PRICE_OPTIONS.min} 
                        max={PRICE_OPTIONS.max}
                        step={PRICE_OPTIONS.step}
                        disabled={loading}
                      />
                    </div>
                    <div className={styles.pbGroup}>
                      <label>Max Price</label>
                      <input 
                        type="number" 
                        value={maxPrice} 
                        onChange={(e) => setMaxPrice(e.target.value)} 
                        placeholder={`Max: ${PRICE_OPTIONS.max}`} 
                        min={PRICE_OPTIONS.min} 
                        max={PRICE_OPTIONS.max}
                        step={PRICE_OPTIONS.step}
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <small>Range must be at least 100 BDT apart</small>
                </div>
              )}
            </div>

            {/* Delivery Section */}
            <div className={styles.pbGroup}>
              <label>
                Delivery Time <span className={styles.requiredStar}>*</span>
              </label>
              
              <div className={styles.pbRadioGroup}>
                <label className={styles.pbRadioLabel}>
                  <input
                    type="radio"
                    name="deliveryType"
                    value="fixed"
                    checked={deliveryType === 'fixed'}
                    onChange={() => {
                      setDeliveryType('fixed');
                      setShowDeliveryRange(false);
                      setMinDelivery('');
                      setMaxDelivery('');
                    }}
                    disabled={loading}
                  />
                  Fixed Days
                </label>
                <label className={styles.pbRadioLabel}>
                  <input
                    type="radio"
                    name="deliveryType"
                    value="range"
                    checked={deliveryType === 'range'}
                    onChange={() => {
                      setDeliveryType('range');
                      setShowDeliveryRange(true);
                      setDeliveryDays('');
                    }}
                    disabled={loading}
                  />
                  Range (Flexible)
                </label>
              </div>

              {deliveryType === 'fixed' ? (
                <div className={styles.pbDeliveryFixed}>
                  <input 
                    type="number" 
                    value={deliveryDays} 
                    onChange={(e) => setDeliveryDays(e.target.value)} 
                    placeholder={`e.g., 7 (Min: ${DELIVERY_OPTIONS.min})`} 
                    min={DELIVERY_OPTIONS.min} 
                    max={DELIVERY_OPTIONS.max}
                    step={DELIVERY_OPTIONS.step}
                    disabled={loading}
                  />
                  <small>
                    Min: {DELIVERY_OPTIONS.min} day • 
                    Max: {DELIVERY_OPTIONS.max} days
                  </small>
                </div>
              ) : (
                <div className={styles.pbDeliveryRange}>
                  <div className={styles.pbRowTwin}>
                    <div className={styles.pbGroup}>
                      <label>Min Days</label>
                      <input 
                        type="number" 
                        value={minDelivery} 
                        onChange={(e) => setMinDelivery(e.target.value)} 
                        placeholder={`Min: ${DELIVERY_OPTIONS.min}`} 
                        min={DELIVERY_OPTIONS.min} 
                        max={DELIVERY_OPTIONS.max}
                        step={DELIVERY_OPTIONS.step}
                        disabled={loading}
                      />
                    </div>
                    <div className={styles.pbGroup}>
                      <label>Max Days</label>
                      <input 
                        type="number" 
                        value={maxDelivery} 
                        onChange={(e) => setMaxDelivery(e.target.value)} 
                        placeholder={`Max: ${DELIVERY_OPTIONS.max}`} 
                        min={DELIVERY_OPTIONS.min} 
                        max={DELIVERY_OPTIONS.max}
                        step={DELIVERY_OPTIONS.step}
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <small>Range must be at least 1 day apart</small>
                </div>
              )}
            </div>

            {/* Service Description */}
            <div className={styles.pbGroup}>
              <label>
                Service Description <span className={styles.requiredStar}>*</span>
                <span className={styles.charCount}>{description.length}/5000</span>
              </label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed description of your service (minimum 20 characters)"
                rows="4"
                maxLength="5000"
                required
                disabled={loading}
              />
              <small>Minimum 20 characters</small>
            </div>

            {/* Images (Exactly 2 required) */}
            <div className={styles.pbGroup}>
              <label>
                Service Images <span className={styles.requiredStar}>*</span>
                <span className={styles.imageHint}>(Exactly 2 images required • Auto-compressed)</span>
              </label>
              <input 
                type="file" 
                accept="image/*" 
                style={{ display: 'none' }} 
                ref={fileInputRef}
                onChange={handleImageChange}
                multiple 
                disabled={loading}
              />

              {selectedImages.length < 2 ? (
                <div 
                  className={`${styles.uploadDropZone} ${loading ? styles.disabled : ''}`} 
                  onClick={() => !loading && fileInputRef.current.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add(styles.dragOver); }}
                  onDragLeave={(e) => e.currentTarget.classList.remove(styles.dragOver)}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove(styles.dragOver);
                    const files = Array.from(e.dataTransfer.files);
                    if (files.length > 0) {
                      const remainingSlots = 2 - selectedImages.length;
                      if (files.length > remainingSlots) {
                        setError(`⚠️ You can upload ${remainingSlots} more image${remainingSlots > 1 ? 's' : ''} (exactly 2 required)`);
                        return;
                      }
                      const inputEvent = { target: { files: files } };
                      handleImageChange(inputEvent);
                    }
                  }}
                >
                  <i className="fa-solid fa-cloud-arrow-up"></i>
                  <p>{loading ? '⏳ Compressing...' : 'Click or drag to upload images'}</p>
                  <span>{selectedImages.length}/2 uploaded • Exactly 2 images required</span>
                  {selectedImages.length < 2 && (
                    <span className={styles.uploadWarning}>
                      ⚠️ You must upload exactly 2 images
                    </span>
                  )}
                </div>
              ) : (
                <div className={styles.uploadDropZoneDisabled}>
                  <p>
                    <i className="fa-solid fa-circle-check" style={{ color: '#438e82' }}></i> 
                    2 images uploaded (Complete)
                  </p>
                </div>
              )}

              {imagePreviews.length > 0 && (
                <div className={styles.multiPreviewGrid}>
                  {imagePreviews.map((previewUrl, index) => (
                    <div key={index} className={styles.uploadPreviewContainer}>
                      <img src={previewUrl} alt={`Preview ${index}`} className={styles.uploadedLiveImg} />
                      <button 
                        type="button" 
                        className={styles.removeImgBtn} 
                        onClick={() => handleRemoveImage(index)}
                        disabled={loading}
                      >
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                      <span className={styles.imageOrderBadge}>{index + 1}</span>
                      <span className={styles.imageSizeBadge}>
                        {selectedImages[index] && (selectedImages[index].size / 1024).toFixed(1)}KB
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
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
              onClick={resetForm}
              disabled={loading}
            >
              <i className="fa-solid fa-rotate"></i> Reset
            </button>
            <button 
              type="submit" 
              className={`${styles.pboxBtn} ${styles.pbBtnPublish} ${isButtonDisabled ? styles.btnLockedStyle : ''}`} 
              disabled={isButtonDisabled || loading}
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i> {uploadProgress > 0 ? `Uploading ${uploadProgress}%` : 'Processing...'}
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

export default PostServiceBox;