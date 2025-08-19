// src/components/AssetTable.jsx
import React, { useEffect, useState, useRef } from 'react';
import { getAllAssets, deleteAsset, forceDeleteAsset } from '../utils/api';
import AssetForm from './AssetForm';
import SmartExportPanel from './SmartExportPanel';
import Modal from './Modal';

export default function AssetTable({ refreshSignal, onEditStart, onEditEnd, backSignal }) {
  const [assets, setAssets] = useState([]);
  const [editingAsset, setEditingAsset] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState({ group: [], assetType: [] });
  const [dropdown, setDropdown] = useState({ field: null, open: false });
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [showExportPanel, setShowExportPanel] = useState(false);

  const dropdownRef = useRef();
  const editSectionRef = useRef(null);
  const highlightTimer = useRef(null);

  useEffect(() => {
    loadAssets();
  }, [refreshSignal]);

  // Scroll + highlight when entering edit
  useEffect(() => {
    if (editingAsset && editSectionRef.current) {
      editSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const el = editSectionRef.current;
      el.style.boxShadow = '0 0 0 3px #ffe58f';
      el.style.transition = 'box-shadow 600ms ease';
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => {
        el.style.boxShadow = 'none';
      }, 1200);
    }
    return () => clearTimeout(highlightTimer.current);
  }, [editingAsset]);

  // If parent sends a back signal (e.g., header back button), close edit
  useEffect(() => {
    if (!backSignal) return;
    if (editingAsset) {
      setEditingAsset(null);
      onEditEnd && onEditEnd();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [backSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAssets = async () => {
    const data = await getAllAssets();
    setAssets(data);
  };

  const filteredAssets = assets.filter(asset => {
    const matchGroup = filter.group.length > 0 ? filter.group.includes(asset.group) : true;
    const matchType = filter.assetType.length > 0 ? filter.assetType.includes(asset.assetType) : true;
    const matchSearch = searchText.trim()
      ? Object.values(asset).some(val => typeof val === 'string' && val.toLowerCase().includes(searchText.toLowerCase()))
      : true;
    return matchGroup && matchType && matchSearch;
  });

  async function handleDelete(asset) {
    try {
      if (asset.assetId) {
        await deleteAsset(asset.assetId);
      } else {
        await forceDeleteAsset({ macAddress: asset.macAddress, ipAddress: asset.ipAddress });
      }
      alert('Asset deleted');
      loadAssets();
    } catch (err) {
      console.error(err);
      alert('Delete failed');
    }
  }

  const toggleDropdown = (e, field) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdown({ field, open: true });
    setDropdownPosition({ top: rect.bottom, left: rect.left });
  };

  const uniqueValues = (field) => Array.from(new Set(assets.map(a => a[field]).filter(Boolean)));

  const handleCheckboxChange = (field, value) => {
    setFilter(prev => {
      const current = prev[field];
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [field]: updated };
    });
  };

  const clearFilter = (field) => setFilter(prev => ({ ...prev, [field]: [] }));
  const closeDropdown = () => setDropdown(prev => ({ ...prev, open: false }));

  // Helpers to enter/exit edit consistently
  const startEdit = (asset) => {
    setEditingAsset(asset);
    onEditStart && onEditStart();
  };

  const endEdit = (refresh = false) => {
    setEditingAsset(null);
    onEditEnd && onEditEnd();
    if (refresh) loadAssets();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ padding: '20px', background: '#f9f9f9', borderRadius: '10px' }}>
      <h2 style={{ marginBottom: '10px', fontSize: '24px' }}>Asset List</h2>

      <div style={{ marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Search by Asset ID, Serial Number, Brand..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ padding: '6px', width: '300px' }}
        />
      </div>

      <button
        onClick={() => setShowExportPanel(true)}
        style={{
          background: 'green',
          color: '#fff',
          padding: '8px 16px',
          border: 'none',
          borderRadius: '5px',
          marginBottom: '20px',
          cursor: 'pointer'
        }}
      >
        Export to Excel
      </button>

      <Modal isOpen={showExportPanel} onClose={() => setShowExportPanel(false)}>
        <h3 style={{ marginTop: 0, textAlign: 'center' }}>Export Assets</h3>
        <SmartExportPanel assets={filteredAssets} />
      </Modal>

      {editingAsset && (
        <>
         
          <div
            ref={editSectionRef}
            style={{
              marginBottom: '20px',
              background: '#fffbe6',
              padding: '15px',
              borderRadius: '8px'
            }}
          >
            <h3 style={{ marginTop: 0 }}>Edit Asset: {editingAsset.assetId}</h3>

            <AssetForm
              editData={editingAsset}
              onSave={() => endEdit(true)}     
              onCancel={() => endEdit(false)}  
              onDeleted={() => endEdit(true)}  
            />
          </div>
        </>
      )}

      {filteredAssets.length === 0 ? (
        <p style={{ fontStyle: 'italic', color: '#999' }}>No assets found.</p>
      ) : (
        <div style={{ overflowX: 'auto', position: 'relative' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
            <thead style={{ background: '#e9ecef' }}>
              <tr>
                <th style={thStyle}>Asset ID</th>
                <th style={thStyle} onClick={(e) => toggleDropdown(e, 'group')}>Group ▾</th>
                <th style={thStyle} onClick={(e) => toggleDropdown(e, 'assetType')}>Asset Type ▾</th>
                <th style={thStyle}>Brand / Model</th>
                <th style={thStyle}>Serial Number</th>
                <th style={thStyle}>Assigned To</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => (
                <tr
                  key={asset.assetId}
                  style={{ borderBottom: '1px solid #ddd', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f1f1')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                >
                  <td style={tdStyle}>{asset.assetId}</td>
                  <td style={tdStyle}>{asset.group}</td>
                  <td style={tdStyle}>{asset.assetType}</td>
                  <td style={tdStyle}>{asset.brandModel}</td>
                  <td style={tdStyle}>{asset.serialNumber}</td>
                  <td style={tdStyle}>{asset.assignedTo}</td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => startEdit(asset)}
                      style={editBtnStyle}
                    >
                      Edit
                    </button>
                    <button onClick={() => handleDelete(asset)} style={deleteBtnStyle}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {dropdown.open && (
            <div
              ref={dropdownRef}
              style={{
                position: 'fixed',
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                zIndex: 1000,
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: '5px',
                padding: '10px',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
              }}
            >
              {uniqueValues(dropdown.field).map((val) => (
                <div key={val} style={{ marginBottom: '8px' }}>
                  <label style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={filter[dropdown.field].includes(val)}
                      onChange={() => handleCheckboxChange(dropdown.field, val)}
                      style={{ marginRight: '6px' }}
                    />
                    {val}
                  </label>
                </div>
              ))}
              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <button
                  onClick={() => clearFilter(dropdown.field)}
                  style={{ fontSize: '12px', color: '#007bff', border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                  Clear Filter
                </button>
                <button
                  onClick={closeDropdown}
                  style={{ fontSize: '12px', marginLeft: '10px', color: '#28a745', border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: '10px',
  textAlign: 'left',
  fontWeight: 'bold',
  fontSize: '14px',
  borderBottom: '2px solid #ccc',
  cursor: 'pointer',
  position: 'relative'
};

const tdStyle = {
  padding: '10px',
  fontSize: '14px',
  verticalAlign: 'top'
};

const editBtnStyle = {
  background: '#007bff',
  color: '#fff',
  padding: '5px 10px',
  marginRight: '5px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
};

const deleteBtnStyle = {
  background: '#dc3545',
  color: '#fff',
  padding: '5px 10px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
};
