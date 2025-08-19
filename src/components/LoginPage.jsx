// src/components/LoginPage.jsx
import React, { useState } from 'react';
import { login } from '../utils/api';

export default function LoginPage({ onLoggedIn }) {
  const [username, setUsername] = useState(''); // email or domain user (e.g., user or user@swd.bh)
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { user } = await login(username.trim(), password);
      onLoggedIn?.(user);
    } catch (e) {
      setError(e.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <form onSubmit={submit} style={card}>
        <h2 style={{ margin: 0, textAlign: 'center' }}>IT Asset Manager</h2>
        <p style={{ marginTop: 8, marginBottom: 18, textAlign: 'center', color: '#555' }}>
          Sign in with your domain account
        </p>

        <label style={label}>Username or Email</label>
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="user or user@swd.bh"
          style={input}
        />

        <label style={{ ...label, marginTop: 12 }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={input}
        />

        {error && <div style={{ color: '#b91c1c', marginTop: 10 }}>{error}</div>}

        <button type="submit" disabled={busy} style={button}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const wrap = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: '#f7f7f9'
};
const card = {
  width: 360,
  background: '#fff',
  padding: 24,
  borderRadius: 12,
  boxShadow: '0 8px 24px rgba(0,0,0,0.08)'
};
const label = { display: 'block', marginBottom: 6, fontWeight: 600, color: '#333' };
const input = { width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d1d5db' };
const button = { width: '100%', marginTop: 16, padding: 10, border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer' };
