import React from 'react';
import { exportToExcel } from '../utils/exportUtils';

export default function ExportButton({ assets }) {
  return (
    <button
      onClick={() => exportToExcel(assets)}
      style={{
        background: '#00791eff',
        color: '#fff',
        padding: '8px 16px',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        marginBottom: '20px'
      }}
    >
      Export to Excel
    </button>
  );
}
