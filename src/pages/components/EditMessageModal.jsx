import React from 'react';
import styles from './EditMessageModal.module.css';

export const EditMessageModal = ({ editMessage, setEditMessage, onSave }) => {
  if (!editMessage) return null;

  return (
    <div className={styles.modalOverlay} onClick={() => setEditMessage(null)}>
      <div className={styles.editMessageModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3><i className="fa-regular fa-pen-to-square"></i> Edit Message</h3>
          <button className={styles.modalClose} onClick={() => setEditMessage(null)}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <textarea 
            value={editMessage.text}
            onChange={(e) => setEditMessage({ ...editMessage, text: e.target.value })}
            rows="4"
            autoFocus
          />
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnCancel} onClick={() => setEditMessage(null)}>Cancel</button>
          <button className={styles.btnSave} onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default EditMessageModal;  // ✅ default export