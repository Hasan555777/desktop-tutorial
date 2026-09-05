import React from 'react';
import styles from './EditMessageModal.module.css';

// 🔧 FIX (edit-scope): now used for text messages AND image captions
// (never voice/document — those are filtered out before this modal
// ever opens, see ChatInterface.jsx's handleContextMenu). `isImage`
// just changes the modal's title/placeholder so editing an image's
// caption doesn't look like you're editing a random text message.
export const EditMessageModal = ({ editMessage, setEditMessage, onSave, isImage }) => {
  if (!editMessage) return null;

  return (
    <div className={styles.modalOverlay} onClick={() => setEditMessage(null)}>
      <div className={styles.editMessageModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3><i className="fa-regular fa-pen-to-square"></i> {isImage ? 'Edit Caption' : 'Edit Message'}</h3>
          <button className={styles.modalClose} onClick={() => setEditMessage(null)}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <textarea 
            value={editMessage.text}
            onChange={(e) => setEditMessage({ ...editMessage, text: e.target.value })}
            rows="4"
            autoFocus
            placeholder={isImage ? 'ছবির ক্যাপশন লিখুন...' : ''}
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