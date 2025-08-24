// src/utils/api.js

// Prefer environment variable; otherwise default to the SAME host you opened the app on.
// This avoids localhost/IP mismatches during dev and LAN testing.
// Restart `npm start` after changing .env (REACT_APP_API_URL).
const defaultHost =
  typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const defaultProtocol =
  typeof window !== 'undefined' ? window.location.protocol : 'http:';
const DEFAULT_API = `${defaultProtocol}//${defaultHost}:4000`;

export const API_URL = (process.env.REACT_APP_API_URL || DEFAULT_API).replace(/\/+$/, '');

// Small helper to standardize fetch + errors
async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    // Only set JSON header when we actually send a body
    headers: {
      ...(!isFormData && options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    method,
    credentials: 'include', // IMPORTANT: send/receive session cookie
    ...options,
  });

  // Try to parse JSON; fall back to text for clearer errors
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => '');

  if (!res.ok) {
    const msg =
      (isJson && payload && (payload.error || payload.message)) ||
      (typeof payload === 'string' && payload) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return payload;
}

/* ===== Auth helpers ===== */
export function authMe() {
  return request('/auth/me', { method: 'GET' });
}

export function login(username, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return request('/auth/logout', { method: 'POST' });
}

/* ===== Assets CRUD ===== */

// Get all assets
export async function getAllAssets() {
  return request('/assets', { method: 'GET' });
}

// Add new asset (expects assetId present, per current backend contract)
export async function addAsset(asset) {
  return request('/assets', {
    method: 'POST',
    body: JSON.stringify(asset),
  });
}

// Update existing asset, allow assetId to change
export async function updateAsset(updatedAsset, originalId) {
  const targetId = encodeURIComponent(originalId || updatedAsset.assetId);
  return request(`/assets/${targetId}`, {
    method: 'PUT',
    body: JSON.stringify(updatedAsset),
  });
}

// Delete asset by assetId
export async function deleteAsset(assetId) {
  if (!assetId) throw new Error('Asset ID is required for standard deletion');
  const id = encodeURIComponent(assetId);
  return request(`/assets/${id}`, { method: 'DELETE' });
}

// Force delete by assetId, macAddress, or ipAddress
export async function forceDeleteAsset({ assetId, macAddress, ipAddress }) {
  const params = new URLSearchParams();
  if (assetId) params.append('assetId', assetId);
  if (macAddress) params.append('macAddress', macAddress);
  if (ipAddress) params.append('ipAddress', ipAddress);

  return request(`/assets/force-delete?${params.toString()}`, { method: 'DELETE' });
}

/* ===== ID Generation ===== */

// Get the next available asset ID (based on assetType)
// Note: this does NOT reserve the ID on the server.
export async function getNextAssetId(assetType = '') {
  const encodedType = encodeURIComponent(assetType);
  const { id } = await request(`/assets/next-id/${encodedType}`, { method: 'GET' });
  return id;
}

// Optional alias
export async function getNextAssetIdByType(assetType) {
  return getNextAssetId(assetType);
}

/* ===== Scanning & Bulk Insert ===== */

// Non-streaming scan (returns JSON list of discovered devices; not inserted yet)
export async function scanNetwork(target) {
  return request(`/scan`, {
    method: 'POST',
    body: JSON.stringify({ target }),
  });
}

// Bulk add assets
export async function bulkAddAssets(assets) {
  return request(`/assets/bulk`, {
    method: 'POST',
    body: JSON.stringify({ assets }),
  });
}
/* ===== Invoices (PDF) ===== */
// POST /assets/:assetId/invoice  (multipart/form-data with field "file")
// Expects backend to store and associate the file, returning { url: '...' }
export async function uploadInvoice(assetId, file) {
  if (!assetId) throw new Error('assetId is required to upload an invoice');
  if (!(file instanceof File)) throw new Error('file must be a File');
  const fd = new FormData();
  fd.append('file', file);
  const encoded = encodeURIComponent(assetId);
  // Return payload: e.g., { url: 'https://.../invoices/ASSET-001.pdf' }
  return request(`/assets/${encoded}/invoice`, {
    method: 'POST',
    body: fd,
  });
}