import React from 'react';

export default function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div style={backdropStyle}>
      <div style={modalStyle}>
        {children}
        <div style={{ textAlign: 'right', marginTop: '10px' }}>
          <button onClick={onClose} style={closeBtnStyle}>Close</button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalStyle = {
  background: '#fff',
  padding: '20px',
  borderRadius: '8px',
  width: '90%',
  maxWidth: '600px',
  boxShadow: '0 5px 15px rgba(0,0,0,0.3)'
};

const closeBtnStyle = {
  background: '#6c757d',
  color: '#fff',
  padding: '6px 12px',
  border: 'none',
  borderRadius: '5px',
  cursor: 'pointer'
};
