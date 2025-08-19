import React, { useState } from 'react';
import { exportToExcel, exportToExcelByGroup, exportGroupOnly } from '../utils/exportUtils';

export default function SmartExportPanel({ assets }) {
  const [mode, setMode] = useState('all');
  const [group, setGroup] = useState('');
  const [fileName, setFileName] = useState('assets_export.xlsx');

  const allGroups = Array.from(new Set(assets.map(a => a.group))).filter(Boolean);

  const handleExport = () => {
    if (!assets.length) return alert('No assets to export.');

    switch (mode) {
      case 'all':
        exportToExcel(assets, fileName);
        break;
      case 'byGroup':
        exportToExcelByGroup(assets, fileName);
        break;
      case 'singleGroup':
        if (!group) return alert('Select a group first');
        exportGroupOnly(assets, group, fileName);
        break;
      default:
        break;
    }
  };

  return (
    <div style={container}>
      <div style={field}>
        <label style={label}>Export Mode</label>
        <select value={mode} onChange={(e) => setMode(e.target.value)} style={select}>
          <option value="all">All assets (1 sheet)</option>
          <option value="byGroup">By group (separate sheets)</option>
          <option value="singleGroup">Specific group only</option>
        </select>
      </div>

      {mode === 'singleGroup' && (
        <div style={field}>
          <label style={label}>Choose Group</label>
          <select value={group} onChange={(e) => setGroup(e.target.value)} style={select}>
            <option value="">-- Select --</option>
            {allGroups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      )}

      <div style={field}>
        <label style={label}>File Name</label>
        <input
          type="text"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          style={input}
          placeholder="e.g. assets_export.xlsx"
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <button onClick={handleExport} style={button}>Export Now</button>
      </div>
    </div>
  );
}

// === Styles ===
const container = {
  background: '#ffffff',
  padding: '20px',
  borderRadius: '10px',
  border: '1px solid #ddd',
  maxWidth: '600px',
  margin: '0 auto 30px auto',
  boxShadow: '0 0 12px rgba(0,0,0,0.06)'
};

const field = {
  marginBottom: '16px'
};

const label = {
  display: 'block',
  marginBottom: '6px',
  fontWeight: 'bold',
  color: '#444'
};

const input = {
  width: '100%',
  padding: '10px',
  border: '1px solid #ccc',
  borderRadius: '6px',
  fontSize: '14px'
};

const select = {
  width: '100%',
  padding: '10px',
  border: '1px solid #ccc',
  borderRadius: '6px',
  fontSize: '14px',
  background: '#fff'
};

const button = {
  backgroundColor: '#007bff',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '10px 20px',
  fontSize: '16px',
  cursor: 'pointer'
};
