// src/components/Dashboard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { getAllAssets } from '../utils/api';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, LabelList,
  PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid
} from 'recharts';
import Modal from '../components/Modal'; // added import for interactive modal

export default function Dashboard() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [presentation, setPresentation] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // New state to track drill‑down details
  const [drill, setDrill] = useState(null);
  // handle clicks on group bars
  const handleGroupClick = (groupName) => {
    const list = assets.filter(a => (a.group || 'Ungrouped') === groupName);
    setDrill({ type: 'group', key: groupName, assets: list });
  };
  // handle clicks on status pie slices
  const handleStatusClick = (statusName) => {
    const list = assets.filter(a => (a.status || 'Unknown') === statusName);
    setDrill({ type: 'status', key: statusName, assets: list });
  };
  // close the modal
  const closeDrill = () => setDrill(null);

  // Load data and auto‑refresh
  const load = async () => {
    setLoading(true);
    try {
      const data = await getAllAssets();
      setAssets(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  // Utility functions
  const now = useMemo(() => new Date(), []);
  const dayDiff = (a, b) => Math.ceil((a - b) / (1000 * 60 * 60 * 24));
  const toNum = (v) => {
    const n = Number(String(v ?? '').toString().replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const parseDate = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    return isNaN(dt) ? null : dt;
  };
  const yyyymm = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const monthsBack = (n) => {
    const arr = [];
    const base = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      arr.push({ key: yyyymm(d), label: d.toLocaleString(undefined, { month: 'short' }) + ' ' + String(d.getFullYear()).slice(-2) });
    }
    return arr;
  };
  const shorten = (s, max = 12) => (s && s.length > max ? s.slice(0, max - 1) + '…' : s);

  // Colour palettes
  const SERIES = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#22c55e', '#e11d48', '#64748b', '#14b8a6'];
  const STATUS_COLORS = {
    Active: '#16a34a',
    'Not active': '#ef4444',
    Retired: '#64748b',
    Suspended: '#f59e0b',
    Unknown: '#94a3b8'
  };

  // Main metrics and datasets
  const {
    total,
    activeCount,
    unassignedCount,
    missingSerials,
    percentActive,
    totalValue,
    currentValue,
    avgAgeYears,
    expiringSoon,
    byGroup,
    byStatus,
    byMonth,
    topTypesByCost
  } = useMemo(() => {
    const total = assets.length;
    const activeCount = assets.filter(a => (a.status || '').toLowerCase() === 'active').length;
    const unassignedCount = assets.filter(a => !a.assignedTo || String(a.assignedTo).trim() === '').length;
    const missingSerials = assets.filter(a => !a.serialNumber || String(a.serialNumber).trim() === '').length;
    const percentActive = total ? (activeCount / total) * 100 : 0;

    let totalValue = 0;
    let currentValue = 0;
    assets.forEach(a => {
      const cost = toNum(a.cost);
      const dep = toNum(a.depreciation);
      totalValue += cost;
      currentValue += Math.max(0, cost - dep);
    });

    const ages = assets
      .map(a => parseDate(a.purchaseDate))
      .filter(Boolean)
      .map(d => (now - d) / (1000 * 60 * 60 * 24 * 365));
    const avgAgeYears = ages.length ? (ages.reduce((s, v) => s + v, 0) / ages.length) : 0;

    const expiringSoon = assets
      .map(a => {
        const d = parseDate(a.warrantyExpiry);
        return d ? { ...a, _days: dayDiff(d, now) } : null;
      })
      .filter(Boolean)
      .filter(a => a._days >= 0 && a._days <= 90)
      .sort((a, b) => a._days - b._days)
      .slice(0, 12);

    const groupMap = new Map();
    assets.forEach(a => {
      const key = a.group || 'Ungrouped';
      groupMap.set(key, (groupMap.get(key) || 0) + 1);
    });
    const byGroup = Array.from(groupMap.entries()).map(([name, value], i) => ({ name, value, fill: SERIES[i % SERIES.length] }));

    const statusMap = new Map();
    assets.forEach(a => {
      const raw = (a.status || 'Unknown').trim();
      const key = raw in STATUS_COLORS ? raw : (raw || 'Unknown');
      statusMap.set(key, (statusMap.get(key) || 0) + 1);
    });
    const byStatus = Array.from(statusMap.entries()).map(([name, value]) => ({
      name,
      value,
      fill: STATUS_COLORS[name] || STATUS_COLORS.Unknown
    }));

    const last12 = monthsBack(12);
    const monthCounts = Object.fromEntries(last12.map(m => [m.key, 0]));
    assets.forEach(a => {
      const d = parseDate(a.purchaseDate || a.createdAt);
      if (!d) return;
      const key = yyyymm(d);
      if (key in monthCounts) monthCounts[key] += 1;
    });
    const byMonth = last12.map((m, i) => ({ idx: i, month: m.label, count: monthCounts[m.key] }));

    const typeCost = new Map();
    assets.forEach(a => {
      const t = a.assetType || 'Unknown';
      typeCost.set(t, (typeCost.get(t) || 0) + toNum(a.cost));
    });
    const topTypesByCost = Array.from(typeCost.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map((d, i) => ({ ...d, fill: SERIES[i % SERIES.length] }));

    return {
      total,
      activeCount,
      unassignedCount,
      missingSerials,
      percentActive,
      totalValue,
      currentValue,
      avgAgeYears,
      expiringSoon,
      byGroup,
      byStatus,
      byMonth,
      topTypesByCost
    };
  }, [assets, now]);

  // Compute details for modal when drill‑down is active
  const drillSummary = useMemo(() => {
    if (!drill) return null;
    const list = drill.assets;
    const sumCost = list.reduce((s, a) => s + toNum(a.cost), 0);
    const avgAge =
      list
        .map(a => parseDate(a.purchaseDate))
        .filter(Boolean)
        .map(d => (now - d) / (1000 * 60 * 60 * 24 * 365))
        .reduce((s, v) => s + v, 0) / (list.length || 1);

    const typeCount = {};
    list.forEach(a => {
      const t = a.assetType || 'Unknown';
      typeCount[t] = (typeCount[t] || 0) + 1;
    });
    const topTypes = Object.entries(typeCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      totalAssets: list.length,
      sumCost,
      avgAge,
      topTypes,
      sample: list.slice(0, 10)
    };
  }, [drill, now]);

  if (loading) return <div style={{ padding: 16 }}>Loading dashboard…</div>;

  return (
    <div style={{ display: 'grid', gap: presentation ? 20 : 16 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: presentation ? 22 : 18 }}>Asset Overview</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <small style={{ color: '#6b7280' }}>
            Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </small>
          <button onClick={load} style={btn('neutral')}>Refresh</button>
          <button onClick={() => setPresentation(v => !v)} style={btn('primary')}>
            {presentation ? 'Normal Mode' : 'Presentation Mode'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: presentation ? 16 : 12
        }}
      >
        <KPI title="Total Assets" value={fmtNum(total)} accent="#2563eb" big={presentation} />
        <KPI title="Active" value={fmtNum(activeCount)} accent="#16a34a" big={presentation} />
        <KPI title="% Active" value={`${percentActive.toFixed(1)}%`} accent="#22c55e" big={presentation} />
        <KPI title="Unassigned" value={fmtNum(unassignedCount)} accent="#f59e0b" big={presentation} />
        <KPI title="Expiring ≤90d" value={fmtNum(expiringSoon.length)} accent="#ef4444" big={presentation} />
        <KPI title="Missing Serials" value={fmtNum(missingSerials)} accent="#64748b" big={presentation} />
        <KPI title="Total Value" value={fmtBD(totalValue)} accent="#0ea5e9" big={presentation} />
        <KPI title="Est. Current Value" value={fmtBD(currentValue)} accent="#8b5cf6" big={presentation} />
        <KPI title="Avg. Age" value={`${avgAgeYears.toFixed(1)} yrs`} accent="#14b8a6" big={presentation} />
      </div>

      {/* Charts Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: presentation ? 20 : 16 }}>
        {/* Interactive bar chart for groups */}
        <Card title="Assets by Group">
          {byGroup.length === 0 ? (
            <Empty>Nothing to show</Empty>
          ) : (
            <div style={{ width: '100%', height: presentation ? 360 : 300 }}>
              <ResponsiveContainer>
                <BarChart
                  data={byGroup}
                  margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                  barCategoryGap="18%"
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      height={presentation ? 56 : 48}
                      tickMargin={3}
                      angle={-25}
                      textAnchor="end"
                      tick={{ fontSize: presentation ? 14 : 12 }}
                      tickFormatter={(v) => shorten(v, presentation ? 16 : 12)}
                    />
                    <YAxis allowDecimals={false} domain={[0, 'dataMax']} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} minPointSize={1}>
                      <LabelList
                        dataKey="value"
                        position="top"
                        offset={6}
                        style={{ fontWeight: 700, fill: '#111827', fontSize: presentation ? 14 : 12 }}
                      />
                      {byGroup.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.fill}
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleGroupClick(d.name)}
                        />
                      ))}
                    </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Interactive pie chart for status */}
        <Card title="Assets by Status">
          {byStatus.length === 0 ? (
            <Empty>Nothing to show</Empty>
          ) : (
            <div style={{ width: '100%', height: presentation ? 340 : 280 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Tooltip />
                  {/* Keeping legend for clarity */}
                  <Pie
                    dataKey="value"
                    data={byStatus}
                    nameKey="name"
                    outerRadius={presentation ? 120 : 100}
                    label={(d) => `${d.name} (${d.value})`}
                  >
                    {byStatus.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.fill}
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleStatusClick(d.name)}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: presentation ? 20 : 16 }}>
        <Card title="Assets Added (last 12 months)">
          <div style={{ width: '100%', height: presentation ? 340 : 280 }}>
            <ResponsiveContainer>
              <LineChart data={byMonth} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: presentation ? 14 : 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" name="New Assets" dot activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top 5 Asset Types by Total Cost">
          {topTypesByCost.length === 0 ? (
            <Empty>Nothing to show</Empty>
          ) : (
            <div style={{ width: '100%', height: presentation ? 340 : 280 }}>
              <ResponsiveContainer>
                <BarChart data={topTypesByCost} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                    tickFormatter={(v) => shorten(v, presentation ? 18 : 14)}
                  />
                <YAxis tickFormatter={(v) => fmtBD(v)} />
                <Tooltip formatter={(v) => fmtBD(v)} />
                  <Bar dataKey="value" name="Total Cost">
                    <LabelList dataKey="value" position="top" formatter={(v) => fmtBD(v)} />
                    {topTypesByCost.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Expiring soon list */}
      <Card title="Warranties Expiring Soon (next 90 days)">
        {expiringSoon.length === 0 ? (
          <Empty>All clear</Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f3f4f6' }}>
                <tr>
                  <th style={th(presentation)}>Asset ID</th>
                  <th style={th(presentation)}>Group</th>
                  <th style={th(presentation)}>Type</th>
                  <th style={th(presentation)}>Warranty Expiry</th>
                  <th style={th(presentation)}>Days Left</th>
                  <th style={th(presentation)}>Assigned To</th>
                </tr>
              </thead>
              <tbody>
                {expiringSoon.map((a) => (
                  <tr key={a.assetId} style={{ borderBottom: '1px solid #eee', background: a._days <= 14 ? '#fff1f2' : 'transparent' }}>
                    <td style={td(presentation)}>{a.assetId}</td>
                    <td style={td(presentation)}>{a.group || '-'}</td>
                    <td style={td(presentation)}>{a.assetType || '-'}</td>
                    <td style={td(presentation)}>{a.warrantyExpiry || '-'}</td>
                    <td style={{ ...td(presentation), fontWeight: a._days <= 14 ? 700 : 400, color: a._days <= 14 ? '#b91c1c' : undefined }}>
                      {a._days}
                    </td>
                    <td style={td(presentation)}>{a.assignedTo || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Drill‑down modal: shows details when user clicks a bar or pie slice */}
      {drill && (
        <Modal isOpen={!!drill} onClose={closeDrill}>
          <div style={{ maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>
              {drill.type === 'group' ? `Details for Group: ${drill.key}` : `Details for Status: ${drill.key}`}
            </h3>
            {drillSummary && (
              <>
                <p><strong>Total assets:</strong> {drillSummary.totalAssets}</p>
                <p><strong>Total cost:</strong> {fmtBD(drillSummary.sumCost)}</p>
                <p><strong>Average age:</strong> {drillSummary.avgAge.toFixed(1)} yrs</p>
                <h4 style={{ marginTop: 20 }}>Top asset types</h4>
                {drillSummary.topTypes.length === 0 ? (
                  <p>No asset types found.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f3f4f6' }}>
                      <tr>
                        <th style={{ ...td(false), fontWeight: 700 }}>Type</th>
                        <th style={{ ...td(false), fontWeight: 700, textAlign: 'right' }}>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillSummary.topTypes.map((t) => (
                        <tr key={t.name} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={td(false)}>{t.name}</td>
                          <td style={{ ...td(false), textAlign: 'right' }}>{t.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <h4 style={{ marginTop: 20 }}>Sample assets ({drillSummary.sample.length} shown)</h4>
                {drillSummary.sample.length === 0 ? (
                  <p>No assets to display.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f3f4f6' }}>
                      <tr>
                        <th style={{ ...td(false), fontWeight: 700 }}>Asset ID</th>
                        <th style={{ ...td(false), fontWeight: 700 }}>Type</th>
                        <th style={{ ...td(false), fontWeight: 700 }}>Brand/Model</th>
                        <th style={{ ...td(false), fontWeight: 700 }}>Cost</th>
                        <th style={{ ...td(false), fontWeight: 700 }}>Assigned To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillSummary.sample.map((a) => (
                        <tr key={a.assetId} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={td(false)}>{a.assetId}</td>
                          <td style={td(false)}>{a.assetType || '-'}</td>
                          <td style={td(false)}>{a.brandModel || '-'}</td>
                          <td style={td(false)}>{fmtBD(toNum(a.cost))}</td>
                          <td style={td(false)}>{a.assignedTo || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ===== Small UI atoms ===== */
function KPI({ title, value, accent = '#2563eb', big = false }) {
  return (
    <div style={{
      background: `linear-gradient(180deg, ${hexWithAlpha(accent, 0.08)} 0%, #ffffff 100%)`,
      border: `1px solid ${hexWithAlpha(accent, 0.25)}`,
      borderRadius: 12,
      padding: big ? 20 : 16,
      boxShadow: '0 2px 10px rgba(0,0,0,0.04)'
    }}>
      <div style={{ fontSize: big ? 14 : 12, color: '#6b7280', marginBottom: big ? 8 : 6 }}>{title}</div>
      <div style={{ fontSize: big ? 36 : 28, fontWeight: 800, color: '#0f172a' }}>{value}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      padding: 16,
      boxShadow: '0 6px 18px rgba(0,0,0,0.05)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ color: '#6b7280', fontStyle: 'italic' }}>{children}</div>;
}

/* ===== Styles & helpers ===== */
const th = (big) => ({
  textAlign: 'left',
  padding: big ? '12px' : '10px',
  fontSize: big ? 14 : 13,
  borderBottom: '1px solid #e5e7eb'
});
const td = (big) => ({
  padding: big ? '10px 12px' : '8px 10px',
  fontSize: big ? 14 : 13
});
function fmtNum(n) {
  const v = Math.round(n);
  return v.toLocaleString();
}
function fmtBD(value) {
  const num = Number(value || 0);
  return `BD ${new Intl.NumberFormat('en-BH', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  }).format(num)}`;
}
function hexWithAlpha(hex, alpha = 0.2) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function btn(variant) {
  const base = {
    cursor: 'pointer',
    border: '1px solid transparent',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 13
  };
  if (variant === 'primary') {
    return { ...base, background: '#2563eb', color: '#fff' };
  }
  return { ...base, background: '#f3f4f6', color: '#111827' };
}
