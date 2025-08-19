// src/App.js
import React, { useEffect, useState } from 'react';
import AssetTable from './components/AssetTable';
import AssetForm from './components/AssetForm';
import ScanModal from './components/ScanModal';
import Dashboard from './components/Dashboard';
import { authMe, login, logout } from './utils/api';
import './styles/app.css'; // <- all visual styles live here

function App() {
  /* -------- Auth state -------- */
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await authMe();
        setUser(me?.user || me || null);
      } catch {
        setUser(null);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!creds.username || !creds.password) return;
    setLoggingIn(true);
    setAuthError('');
    try {
      await login(creds.username.trim(), creds.password);
      const me = await authMe();
      setUser(me?.user || me || null);
      setCreds((c) => ({ ...c, password: '' })); // clear pw after success
      setRefresh(Date.now()); // initial data refresh
    } catch (err) {
      setAuthError(err?.message || 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try { await logout(); } catch {}
    setUser(null);
    setView('table');
  };

  /* -------- App view state -------- */
  const [refresh, setRefresh] = useState(Date.now());
  const [view, setView] = useState('table'); // 'table' | 'form' | 'dashboard'
  const [scanOpen, setScanOpen] = useState(false);
  const [editData, setEditData] = useState(null);

  // inline edit coordination with table
  const [editMode, setEditMode] = useState(false);
  const [editBackSignal, setEditBackSignal] = useState(0);

  // navigation helpers
  const goToTable = () => { setView('table'); setEditData(null); };
  const goToFormAdd = () => { setEditData(null); setView('form'); };
  const goToDashboard = () => setView('dashboard');

  const triggerRefresh = () => {
    setRefresh(Date.now());
    goToTable();
  };

  const handleImportedFromScan = () => {
    setScanOpen(false);
    setRefresh(Date.now());
  };

  /* -------- Render gates -------- */
  if (checking) {
    return (
      <div className="screen-center">
        <div className="status-box">Checking your session…</div>
      </div>
    );
  }

  if (!user) {
    // Login screen (unstyled logic; styles come from app.css)
    return (
      <div className="screen-center auth-wrap">
        <div className="auth-card">
          <div className="auth-head">
            <div className="auth-logo">IT</div>
            <h2 className="auth-title">IT Asset Manager</h2>
          </div>
          <p className="auth-subtitle">Sign in with your domain account</p>

          <form onSubmit={handleLogin} className="auth-form" autoComplete="on">
            <label className="label">Username or Email</label>
            <input
              className="input"
              type="text"
              value={creds.username}
              onChange={(e) => setCreds((c) => ({ ...c, username: e.target.value }))}
              placeholder="e.g. user or user@swd.bh"
              autoFocus
              autoComplete="username"
            />

            <label className="label">Password</label>
            <div className="pw-field">
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                value={creds.password}
                onChange={(e) => setCreds((c) => ({ ...c, password: e.target.value }))}
                placeholder="Domain password"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                title={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>

            {authError && <div className="error-box" role="alert">{authError}</div>}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loggingIn || !creds.username || !creds.password}
            >
              {loggingIn ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="auth-foot">Access is limited to IT staff.</div>
        </div>
      </div>
    );
  }

  // Authenticated app
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">IT Asset Manager</h1>
        <div className="user-bar">
          <span className="user-name">{user?.name || user?.email}</span>
          <button className="btn btn-ghost" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {view === 'table' && (
        <>
          <div className="toolbar">
            <div className="toolbar-left">
              {editMode && (
                <button className="btn" onClick={() => setEditBackSignal(Date.now())}>
                  ← Back to List
                </button>
              )}
            </div>
            <div className="toolbar-right">
              <button className="btn" onClick={() => setScanOpen(true)}>Scan Network</button>
              <button className="btn" onClick={goToDashboard}>Dashboard</button>
              <button className="btn btn-accent" onClick={goToFormAdd}>Add New Asset</button>
            </div>
          </div>

          <AssetTable
            refreshSignal={refresh}
            onEditStart={() => setEditMode(true)}
            onEditEnd={() => setEditMode(false)}
            backSignal={editBackSignal}
          />

          <ScanModal
            isOpen={scanOpen}
            onClose={() => setScanOpen(false)}
            onImported={handleImportedFromScan}
          />
        </>
      )}

      {view === 'form' && (
        <>
          <div className="toolbar">
            <div className="toolbar-left">
              <button className="btn" onClick={goToTable}>← Back to List</button>
            </div>
            <div className="toolbar-right" />
          </div>

          <AssetForm
            editData={editData}
            onSave={triggerRefresh}
            onCancel={goToTable}
            onDeleted={triggerRefresh}
          />
        </>
      )}

      {view === 'dashboard' && (
        <>
          <div className="toolbar">
            <div className="toolbar-left">
              <button className="btn" onClick={goToTable}>← Back to List</button>
            </div>
            <div className="toolbar-right" />
          </div>

          <Dashboard />
        </>
      )}
    </div>
  );
}

export default App;
