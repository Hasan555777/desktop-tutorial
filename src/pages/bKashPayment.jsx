import React, { useState, useEffect } from 'react';
import { createPayment, executePayment, queryPayment } from '@pages/bKashHelper';
import './bKashPayment.css';

const BKashPayment = ({ amount, orderId, reference, onSuccess, onError, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('init'); // init, processing, success, failed
  const [paymentID, setPaymentID] = useState(null);
  const [bkashWindow, setBkashWindow] = useState(null);

  // ========== পেমেন্ট ইনিশিয়েট ==========
  const initiatePayment = async () => {
    setLoading(true);
    setStep('processing');
    
    try {
      const result = await createPayment(amount, orderId, reference);
      
      if (result.success) {
        setPaymentID(result.paymentID);
        openBkashWindow(result.bkashURL);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Initiation error:", error);
      setStep('failed');
      if (onError) onError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // ========== bKash উইন্ডো খোলা ==========
  const openBkashWindow = (url) => {
    const width = 450;
    const height = 600;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    
    const newWindow = window.open(
      url,
      'bKash Payment',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
    
    setBkashWindow(newWindow);
    
    // চেক করা পেমেন্ট স্ট্যাটাস
    const checkInterval = setInterval(async () => {
      if (newWindow.closed) {
        clearInterval(checkInterval);
        await checkPaymentStatus();
      }
    }, 1000);
  };

  // ========== পেমেন্ট স্ট্যাটাস চেক ==========
  const checkPaymentStatus = async () => {
    if (!paymentID) return;
    
    setLoading(true);
    
    try {
      const result = await queryPayment(paymentID);
      
      if (result.success && result.status === 'Completed') {
        // পেমেন্ট সফল
        const executeResult = await executePayment(paymentID);
        
        if (executeResult.success) {
          setStep('success');
          if (onSuccess) {
            onSuccess({
              paymentID: paymentID,
              trxID: executeResult.trxID,
              amount: executeResult.amount
            });
          }
        } else {
          throw new Error(executeResult.error);
        }
      } else if (result.status === 'Cancelled') {
        setStep('failed');
        if (onError) onError('Payment cancelled by user');
      } else {
        setStep('failed');
        if (onError) onError('Payment failed');
      }
    } catch (error) {
      console.error("Status check error:", error);
      setStep('failed');
      if (onError) onError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bkash-modal-overlay">
      <div className="bkash-modal">
        <div className="bkash-modal-header">
          <h3><i className="fa-brands fa-btc"></i> bKash Payment</h3>
          <button className="close-btn" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="bkash-modal-body">
          {step === 'init' && (
            <div className="payment-init">
              <div className="amount-display">
                <span>Amount to Pay:</span>
                <strong>৳ {amount}</strong>
              </div>
              <div className="instruction">
                <i className="fa-solid fa-circle-info"></i>
                <p>Click the button below to pay with bKash. You'll be redirected to bKash payment gateway.</p>
              </div>
              <button 
                className="pay-btn"
                onClick={initiatePayment}
                disabled={loading}
              >
                {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-brands fa-btc"></i>}
                Pay with bKash
              </button>
            </div>
          )}

          {step === 'processing' && (
            <div className="payment-processing">
              <div className="spinner"></div>
              <h4>Processing Payment</h4>
              <p>Please complete the payment in the bKash window...</p>
              <small>Do not close this window</small>
            </div>
          )}

          {step === 'success' && (
            <div className="payment-success">
              <i className="fa-solid fa-circle-check"></i>
              <h4>Payment Successful!</h4>
              <p>Your payment has been completed successfully.</p>
              <button className="done-btn" onClick={onClose}>
                Done
              </button>
            </div>
          )}

          {step === 'failed' && (
            <div className="payment-failed">
              <i className="fa-solid fa-circle-exclamation"></i>
              <h4>Payment Failed</h4>
              <p>Something went wrong. Please try again.</p>
              <button className="retry-btn" onClick={() => setStep('init')}>
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BKashPayment;