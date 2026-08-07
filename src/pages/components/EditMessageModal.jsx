import React from 'react';

export const EditMessageModal = ({ editMessage, setEditMessage, onSave }) => {
  if (!editMessage) return null;

  return (
    <div className="modal-overlay" onClick={() => setEditMessage(null)}>
      <div className="edit-message-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><i className="fa-regular fa-pen-to-square"></i> Edit Message</h3>
          <button className="modal-close" onClick={() => setEditMessage(null)}>✕</button>
        </div>
        <div className="modal-body">
          <textarea 
            value={editMessage.text}
            onChange={(e) => setEditMessage({ ...editMessage, text: e.target.value })}
            rows="4"
            autoFocus
          />
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={() => setEditMessage(null)}>Cancel</button>
          <button className="btn-save" onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default EditMessageModal;  // ✅ default export
