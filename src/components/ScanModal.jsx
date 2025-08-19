// src/components/ScanModal.jsx
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { API_URL, bulkAddAssets } from '../utils/api';

export default function ScanModal({ isOpen, onClose, onImported }) {
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState({});
  const [logs, setLogs] = useState([]);
  const [source, setSource] = useState(null);
  const [error, setError] = useState('');

  const pushLog = (line) => setLogs((prev) => [...prev, line].slice(-500));

  const cleanupSource = () => {
    try { source?.close(); } catch {}
    setSource(null);
    setLoading(false);
  };

  const handleScan = () => {
    setError('');
    setDevices([]);
    setSelected({});
    setLogs([]);
    if (!target.trim()) { setError('Enter an IP, range, or CIDR.'); return; }
    setLoading(true);

    const url = `${API_URL}/scan/stream?target=${encodeURIComponent(target.trim())}`;
const es = new EventSource(url, { withCredentials: true });    setSource(es);

    es.addEventListener('log', (e) => {
      pushLog(e.data);
    });

    es.addEventListener('result', (e) => {
      try {
        const list = JSON.parse(e.data || '[]');
        setDevices(Array.isArray(list) ? list : []);
        setSelected(Object.fromEntries((Array.isArray(list) ? list : []).map(d => [d.assetId, true])));
        pushLog(`Received ${Array.isArray(list) ? list.length : 0} devices.`);
      } catch {
        setError('Invalid result from scanner.');
      } finally {
        es.close();
        setSource(null);
        setLoading(false);
      }
    });

    es.addEventListener('error', () => {
      // Some proxies emit a generic error during open; if no source yet, ignore once.
      pushLog('Scanner error.');
      setError('Scan failed.');
      es.close();
      setSource(null);
      setLoading(false);
    });
  };

  const handleImport = async () => {
    try {
      const toImport = devices.filter(d => selected[d.assetId]);
      if (toImport.length === 0) { setError('Select at least one device.'); return; }
      setLoading(true);
      await bulkAddAssets(toImport);
      onImported?.();
    } catch (e) {
      setError(e.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const stopScan = () => {
    cleanupSource();
    pushLog('Scan cancelled.');
  };

  // Ensure ES is closed when modal closes or component unmounts
  useEffect(() => {
    if (!isOpen) cleanupSource();
    return () => cleanupSource();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={() => { stopScan(); onClose(); }}>
      <h3 style={{ marginTop: 0 }}>Scan Network</h3>
      <p style={{ marginTop: -6, color: '#666' }}>Examples: 10.27.16.25 · 10.27.16.1-50 · 10.27.16.0/24</p>

      <input
        type="text"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="Enter IP / range / CIDR"
        style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
      />

      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        {!source && (
          <button onClick={handleScan} disabled={loading} style={btnPrimary}>
            {loading ? 'Scanning…' : 'Scan'}
          </button>
        )}
        {source && (
          <button onClick={stopScan} style={btnWarn}>
            Stop
          </button>
        )}
        <button
          onClick={handleImport}
          disabled={loading || devices.length === 0}
          style={btnSecondary}
        >
          Import Selected
        </button>
      </div>

      {error && <div style={{ color: '#c00', marginTop: 10 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        <div style={{ border: '1px solid #eee', borderRadius: 6, padding: 8, maxHeight: 260, overflow: 'auto' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Logs</div>
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {logs.join('\n')}
          </pre>
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: 6, padding: 8, maxHeight: 260, overflow: 'auto' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Discovered Devices</div>
          {devices.length === 0 ? (
            <div style={{ color: '#777' }}>No devices yet.</div>
          ) : (
            devices.map(d => (
              <label key={d.assetId} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
                <input
                  type="checkbox"
                  checked={!!selected[d.assetId]}
                  onChange={(e) => setSelected(s => ({ ...s, [d.assetId]: e.target.checked }))}
                />
                <div>
                  <div><b>{d.assetId}</b> — {d.brandModel || d.osFirmware}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {d.group} / {d.assetType} · IP {d.ipAddress} · MAC {d.macAddress || 'Unknown'}
                  </div>
                </div>
              </label>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

const btnPrimary = { background: '#007bff', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer' };
const btnSecondary = { background: '#28a745', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer' };
const btnWarn = { background: '#dc3545', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer' };
