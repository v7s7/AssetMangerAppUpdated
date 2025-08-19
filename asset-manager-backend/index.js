// index.js — Express + SQLite + LDAP auth (meeting-app style) + sessions + protected routes

require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const ldap = require('ldapjs');

const app = express();
const PORT = 4000;

/* --------------------------- Config / Defaults --------------------------- */
// CORS origins (comma separated)
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ||
  'http://10.27.17.20:3000,http://10.27.17.20:3100')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// LDAP (matching your meeting app style)
const LDAP_URL = process.env.LDAP_URL || 'ldap://10.27.16.5';
const LDAP_BASE_DN = process.env.LDAP_BASE_DN || 'DC=swd,DC=local';
const LDAP_DEFAULT_UPN = process.env.LDAP_DEFAULT_UPN || 'swd.bh';    // email-style suffix
const LDAP_ALT_UPN = process.env.LDAP_ALT_UPN || 'swd.local';         // AD DNS suffix
const LDAP_NETBIOS = process.env.LDAP_NETBIOS || 'SWD';               // NETBIOS domain

// Session
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_this_long_random_string';

// Allow-list (ONLY these emails may log in)
// Existing:
const allowedEmails = new Set(
  (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);

// Add this function:
function isAllowedEmailOrUsername(email) {
  if (!email) return false;
  const e = email.toLowerCase();
  if (allowedEmails.has(e)) return true;

  const local = e.split('@')[0];
  // compare just the username (left part) against allowlist usernames
  for (const allowed of allowedEmails) {
    const allowedLocal = allowed.split('@')[0];
    if (allowedLocal === local) return true;
  }
  return false;
}


/* --------------------------- Middleware (top) ---------------------------- */
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked: ' + origin));
  },
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',   // use 'none' + secure:true if you front with HTTPS on a different origin
    // secure: true
  }
}));

/* ------------------------------ SQLite ---------------------------------- */
const dbPath = path.resolve(__dirname, 'assets.db');
const db = new sqlite3.Database(dbPath);

db.run(`CREATE TABLE IF NOT EXISTS assets (
  assetId TEXT PRIMARY KEY,
  "group" TEXT,
  assetType TEXT,
  brandModel TEXT,
  serialNumber TEXT,
  assignedTo TEXT,
  ipAddress TEXT,
  macAddress TEXT,
  osFirmware TEXT,
  cpu TEXT,
  ram TEXT,
  storage TEXT,
  portDetails TEXT,
  powerConsumption TEXT,
  purchaseDate TEXT,
  warrantyExpiry TEXT,
  eol TEXT,
  maintenanceExpiry TEXT,
  cost TEXT,
  depreciation TEXT,
  residualValue TEXT,
  status TEXT,
  condition TEXT,
  usagePurpose TEXT,
  accessLevel TEXT,
  licenseKey TEXT,
  complianceStatus TEXT,
  documentation TEXT,
  remarks TEXT,
  lastAuditDate TEXT,
  disposedDate TEXT,
  replacementPlan TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS used_ids ( assetId TEXT PRIMARY KEY )`);

function requireMinimalFields(body) {
  const required = ['group', 'assetType', 'assetId'];
  return required.filter(f => !body[f] || String(body[f]).trim() === '');
}
function rollback(e, res) {
  db.run('ROLLBACK', () => res.status(500).json({ error: e.message }));
}

/* --------------------------- LDAP Authentication ------------------------- */
function createLdapClient() {
  // Plain ldap:// (389) like your meeting app. If you switch to ldaps://, ldapjs handles it.
  return ldap.createClient({ url: LDAP_URL });
}

/**
 * Try binding with multiple formats in order:
 *  1) user@LDAP_DEFAULT_UPN     (e.g., user@swd.bh)
 *  2) user@LDAP_ALT_UPN         (e.g., user@swd.local)
 *  3) NETBIOS\user              (e.g., SWD\user)
 *  4) if username already has @, try as-is
 */
async function ldapAuthenticate(usernameOrEmail, password) {
  const candidates = [];

  const raw = String(usernameOrEmail || '').trim();
  const isEmailOrUPN = raw.includes('@');

  if (isEmailOrUPN) {
    candidates.push(raw); // as provided (e.g., user@swd.bh)
  } else {
    candidates.push(`${raw}@${LDAP_DEFAULT_UPN}`);
    candidates.push(`${raw}@${LDAP_ALT_UPN}`);
    candidates.push(`${LDAP_NETBIOS}\\${raw}`);
  }

  // Helper: bind attempt
  const attemptBind = (client, dn, pwd) => new Promise((resolve, reject) => {
    client.bind(dn, pwd, (err) => err ? reject(err) : resolve());
  });

  // Helper: search attributes
  const searchAsync = (client, base, options) => new Promise((resolve, reject) => {
    const entries = [];
    client.search(base, options, (err, res) => {
      if (err) return reject(err);
      res.on('searchEntry', (entry) => entries.push(entry.object));
      res.on('error', reject);
      res.on('end', () => resolve(entries));
    });
  });

  let lastErr = null;

  for (const dn of candidates) {
    const client = createLdapClient();
    try {
      await attemptBind(client, dn, password);
      // If bind succeeds, resolve mail/UPN for allow-list check
      const results = await searchAsync(client, LDAP_BASE_DN, {
        scope: 'sub',
        filter: isEmailOrUPN
          ? `(|(userPrincipalName=${raw})(mail=${raw}))`
          : `(|(sAMAccountName=${raw})(userPrincipalName=${raw}@${LDAP_DEFAULT_UPN})(mail=${raw}@${LDAP_DEFAULT_UPN}))`,
        attributes: ['mail', 'userPrincipalName', 'displayName']
      });
      const user = results[0] || {};
      const email = (user.mail || user.userPrincipalName || raw || '').toLowerCase();
      try { client.unbind(); } catch {}
      return { email, displayName: user.displayName || email };
    } catch (e) {
      lastErr = e;
      try { client.unbind(); } catch {}
      // try next candidate
    }
  }

  // All attempts failed
  const err = new Error('LDAP bind failed');
  err.cause = lastErr;
  throw err;
}

/* ---------------------------- Public routes ------------------------------ */
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = await ldapAuthenticate(username, password);
   if (!user?.email || !isAllowedEmailOrUsername(user.email)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    req.session.user = { email: user.email, name: user.displayName };
    res.json({ ok: true, user: req.session.user });
  } catch {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/auth/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'No session' });
  res.json({ user: req.session.user });
});

/* --------------------------- Auth Guard (global) ------------------------- */
app.use((req, res, next) => {
  if (req.path.startsWith('/health') || req.path.startsWith('/auth')) return next();
  if (!req.session?.user) return res.status(401).json({ error: 'Auth required' });
  next();
});

/* ------------------------------ Assets API ------------------------------- */
app.get('/assets', (req, res) => {
  db.all('SELECT * FROM assets', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/assets', (req, res) => {
  const asset = req.body;
  const missing = requireMinimalFields(asset);
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });

  const fields = Object.keys(asset).map(f => (f === 'group' ? `"group"` : f));
  const placeholders = fields.map(() => '?').join(',');
  const sql = `INSERT INTO assets (${fields.join(',')}) VALUES (${placeholders})`;
  db.run(sql, Object.values(asset), function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run(`INSERT OR IGNORE INTO used_ids (assetId) VALUES (?)`, [asset.assetId]);
    res.status(201).json({ id: asset.assetId });
  });
});

app.post('/assets/bulk', (req, res) => {
  const list = req.body?.assets;
  if (!Array.isArray(list) || list.length === 0) return res.status(400).json({ error: 'No assets provided' });
  const required = ['assetId', 'group', 'assetType'];
  const badIdx = list.findIndex(a => required.some(f => !a[f] || String(a[f]).trim() === ''));
  if (badIdx >= 0) return res.status(400).json({ error: `Asset at index ${badIdx} missing required fields` });

  const insert = db.prepare(
    `INSERT OR IGNORE INTO assets (
      assetId,"group",assetType,brandModel,serialNumber,assignedTo,ipAddress,macAddress,osFirmware,cpu,ram,storage,
      portDetails,powerConsumption,purchaseDate,warrantyExpiry,eol,maintenanceExpiry,cost,depreciation,residualValue,
      status,condition,usagePurpose,accessLevel,licenseKey,complianceStatus,documentation,remarks,lastAuditDate,disposedDate,replacementPlan
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );

  db.serialize(() => {
    list.forEach(a => {
      insert.run([
        a.assetId, a.group, a.assetType, a.brandModel, a.serialNumber, a.assignedTo, a.ipAddress, a.macAddress, a.osFirmware, a.cpu, a.ram, a.storage,
        a.portDetails, a.powerConsumption, a.purchaseDate, a.warrantyExpiry, a.eol, a.maintenanceExpiry, a.cost, a.depreciation, a.residualValue,
        a.status, a.condition, a.usagePurpose, a.accessLevel, a.licenseKey, a.complianceStatus, a.documentation, a.remarks, a.lastAuditDate, a.disposedDate, a.replacementPlan
      ]);
      db.run(`INSERT OR IGNORE INTO used_ids (assetId) VALUES (?)`, [a.assetId]);
    });
  });

  insert.finalize((err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ inserted: list.length });
  });
});

app.put('/assets/:id', (req, res) => {
  const asset = req.body;
  const oldId = req.params.id;
  const newId = asset.assetId;

  if (!asset || Object.keys(asset).length === 0) return res.status(400).json({ error: 'No data provided for update' });
  const missing = requireMinimalFields(asset);
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });

  const fields = Object.keys(asset).map(f => (f === 'group' ? `"group"` : f));
  const placeholders = fields.map(() => '?').join(',');

  if (oldId !== newId) {
    db.serialize(() => {
      db.run('BEGIN');
      db.run(`DELETE FROM assets WHERE assetId = ?`, oldId, function (err) {
        if (err) return rollback(err, res);
        const sqlInsert = `INSERT INTO assets (${fields.join(',')}) VALUES (${placeholders})`;
        db.run(sqlInsert, Object.values(asset), function (err2) {
          if (err2) return rollback(err2, res);
          db.run(`INSERT OR IGNORE INTO used_ids (assetId) VALUES (?)`, [asset.assetId], function (err3) {
            if (err3) return rollback(err3, res);
            db.run('COMMIT', () => res.json({ updated: 1 }));
          });
        });
      });
    });
  } else {
    const updates = Object.keys(asset).map(k => `${k === 'group' ? `"group"` : k} = ?`).join(', ');
    const sql = `UPDATE assets SET ${updates} WHERE assetId = ?`;
    const values = [...Object.values(asset), oldId];
    db.run(sql, values, function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
  }
});

app.delete('/assets/:id', (req, res) => {
  db.run(`DELETE FROM assets WHERE assetId = ?`, req.params.id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.delete('/assets/force-delete', (req, res) => {
  const { assetId, macAddress, ipAddress } = req.query;
  if (!assetId && !macAddress && !ipAddress) return res.status(400).json({ error: 'Must provide at least assetId, macAddress, or ipAddress' });

  const conditions = [], params = [];
  if (assetId) { conditions.push('assetId = ?'); params.push(assetId); }
  if (macAddress) { conditions.push('macAddress = ?'); params.push(macAddress); }
  if (ipAddress) { conditions.push('ipAddress = ?'); params.push(ipAddress); }
  const sql = `DELETE FROM assets WHERE ${conditions.join(' OR ')}`;
  db.run(sql, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/assets/next-id/:type', (req, res) => {
  const rawType = req.params.type;
  if (!rawType || rawType.length < 2) return res.status(400).json({ error: 'Invalid asset type' });

  const safePrefix = rawType.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3);
  if (!safePrefix) return res.status(400).json({ error: 'Invalid asset type prefix' });

  db.all(`SELECT assetId FROM used_ids WHERE assetId LIKE '${safePrefix}-%'`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const numbers = rows
      .map(row => {
        const m = row.assetId.match(new RegExp(`^${safePrefix}-(\\d+)$`));
        return m ? parseInt(m[1], 10) : null;
      })
      .filter(n => n !== null);
    const next = numbers.length ? Math.max(...numbers) + 1 : 1;
    res.json({ id: `${safePrefix}-${String(next).padStart(3, '0')}` });
  });
});

/* --------------------------------- Scan ---------------------------------- */
app.post('/scan', (req, res) => {
  const target = (req.body?.target || '').trim();
  if (!target) return res.status(400).send('Target is required');

  const PY = process.env.PYTHON || 'python';
  const script = path.join(__dirname, 'scanner.py');
  const args = [script, '--target', target, '--api-url', `http://localhost:${PORT}`, '--dry-run', '--json'];

  const child = spawn(PY, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', d => (out += d.toString()));
  child.stderr.on('data', d => (err += d.toString()));
  child.on('close', (code) => {
    if (code !== 0) return res.status(500).send(err || `Scanner exited with ${code}`);
    try {
      const list = JSON.parse(out);
      res.json(Array.isArray(list) ? list : []);
    } catch {
      res.status(500).send('Invalid scanner output');
    }
  });
});

app.get('/scan/stream', (req, res) => {
  const target = (req.query.target || '').trim();
  if (!target) return res.status(400).end('Target is required');

  const PY = process.env.PYTHON || 'python';
  const script = path.join(__dirname, 'scanner.py');
  const args = [script, '--target', target, '--api-url', `http://localhost:${PORT}`, '--dry-run', '--json'];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const child = spawn(PY, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const send = (event, data) => { res.write(`event: ${event}\n`); res.write(`data: ${data}\n\n`); };
  const keepAlive = setInterval(() => { res.write(':\n\n'); }, 20000);

  child.stderr.on('data', (d) => {
    String(d).split(/\r?\n/).forEach((line) => { if (line.trim()) send('log', line.trim()); });
  });
  child.stdout.on('data', (d) => { out += d.toString(); });

  child.on('close', (code) => {
    clearInterval(keepAlive);
    if (code !== 0) { send('error', `Scanner exited with code ${code}`); return res.end(); }
    try { send('result', JSON.stringify(JSON.parse(out || '[]'))); }
    catch (e) { send('error', `Invalid JSON: ${e.message}`); }
    res.end();
  });

  req.on('close', () => {
    clearInterval(keepAlive);
    try { child.kill(); } catch {}
  });
});

/* --------------------------------- Start --------------------------------- */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT} (listening on 0.0.0.0)`);
});
