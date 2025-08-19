// src/components/Toast.js
import React, { useEffect } from 'react';

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, type === 'error' ? 10000 : 3000); // errors last longer
    return () => clearTimeout(timer);
  }, [onClose, type]);

  const baseStyle = {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    padding: '14px 24px',
    borderRadius: '8px',
    fontSize: '15px',
    color: '#fff',
    boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    maxWidth: '90%',
    whiteSpace: 'pre-line'
  };

  const background = type === 'error' ? '#dc3545' : '#28a745';

  return (
    <div style={{ ...baseStyle, background }}>
      <span>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fff',
          fontSize: '16px',
          cursor: 'pointer'
        }}
        aria-label="Close"
      >
        ❌
      </button>
    </div>
  );
}
