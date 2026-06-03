/* Oracle Dashboard — data-driven from JSON files */

const BASE = './data/';

async function fetchJSON(file) {
  try {
    const r = await fetch(BASE + file + '?t=' + Date.now());
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function fmt(n, dec=2) { return n == null ? '—' : Number(n).toFixed(dec); }
function fmtPct(n) { return n == null ? '—' : (n * 100).toFixed(1) + '%'; }
function fmtK(n) { return n == null ? '—' : '$' + Number(n).toLocaleString('en', {minimumFractionDigits:2,maximumFractionDigits:2}); }
function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso)) / 60000;
  if (diff < 60) return Math.round(diff) + 'm ago';
  if (diff < 1440) return Math.round(diff/60) + 'h ago';
  return Math.round(diff/1440) + 'd ago';
}
function selBadge(sel) {
  const cls = sel === 'HOME' ? 'home' : sel === 'AWAY' ? 'away' : 'draw';
  return `<span class="badge badge-${cls}">${sel}</span>`;
}

/* ── Portfolio KPIs ───────────────────────────────── */
async function loadPortfolio() {
  const d = await fetchJSON('portfolio.json');
  if (!d) return;

  const roi    = d.roi || 0;
  const rClass = roi >= 0 ? 'up' : 'down';
  const rSign  = roi >= 0 ? '+' : '';

  document.getElementById('stat-equity').textContent    = fmtK(d.equity);
  document.getElementById('stat-roi').textContent       = rSign + fmtPct(roi);
  document.getElementById('stat-roi').className         = 'stat-value ' + rClass;
  document.getElementById('stat-winrate').textContent   = fmtPct(d.win_rate);
  document.getElementById('stat-trades').textContent    = d.total_bets || 0;
  document.getElementById('stat-maxdd').textContent     = fmtPct(d.max_dd);
  document.getElementById('stat-open').textContent      = d.open_bets || 0;
  document.getElementById('updated-at').textContent     = timeAgo(d.updated_at);
}

/* ── Equity curve ─────────────────────────────────── */
async function loadEquityCurve() {
  const d = await fetchJSON('equity_curve.json');
  if (!d || !d.curve || d.curve.length < 2) {
    document.getElementById('equity-chart').parentElement.innerHTML =
      '<div class="empty">No trades yet — equity curve will appear after first settled bet</div>';
    return;
  }

  const curve = d.curve;
  const labels = curve.map(p => p.date || 'Start');
  const values = curve.map(p => p.equity);
  const start  = values[0];

  const ctx = document.getElementById('equity-chart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(59,130,246,0.25)');
  gradient.addColorStop(1, 'rgba(59,130,246,0.00)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#3b82f6',
        backgroundColor: gradient,
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: {display:false}, tooltip: {
        callbacks: { label: c => fmtK(c.parsed.y) }
      }},
      scales: {
        x: { display: false },
        y: {
          grid: { color: 'rgba(30,35,48,0.8)' },
          ticks: { color: '#6b7280', callback: v => '$'+Number(v).toLocaleString() },
          border: { display: false },
        }
      }
    }
  });
}

/* ── Open bets ────────────────────────────────────── */
async function loadOpenBets() {
  const d = await fetchJSON('open_bets.json');
  const tbody = document.getElementById('open-bets-body');
  if (!d || !d.bets || d.bets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No open bets right now</td></tr>';
    return;
  }
  tbody.innerHTML = d.bets.slice(0,20).map(b => `
    <tr>
      <td>${b.home_team} v ${b.away_team}</td>
      <td>${selBadge(b.selection)}</td>
      <td>${fmt(b.odds)}</td>
      <td>${fmtK(b.stake)}</td>
      <td style="font-size:11px;color:var(--muted)">${b.strategy_name}</td>
      <td style="font-size:11px;color:var(--muted)">${timeAgo(b.placed_at)}</td>
    </tr>`).join('');
}

/* ── Recent bets ──────────────────────────────────── */
async function loadRecentBets() {
  const d = await fetchJSON('recent_bets.json');
  const tbody = document.getElementById('recent-bets-body');
  if (!d || !d.bets || d.bets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No settled bets yet</td></tr>';
    return;
  }
  const sorted = [...d.bets].reverse().slice(0,30);
  tbody.innerHTML = sorted.map(b => {
    const outcls = b.outcome === 'WIN' ? 'win' : 'loss';
    const pnlCls = (b.pnl || 0) >= 0 ? 'up' : 'down';
    const pnlSign = (b.pnl || 0) >= 0 ? '+' : '';
    return `
    <tr>
      <td>${b.home_team} v ${b.away_team}</td>
      <td>${selBadge(b.selection)}</td>
      <td>${fmt(b.odds)}</td>
      <td class="${pnlCls}">${pnlSign}${fmtK(b.pnl)}</td>
      <td><span class="badge badge-${outcls}">${b.outcome}</span></td>
      <td style="font-size:11px;color:var(--muted)">${b.strategy_name}</td>
    </tr>`;
  }).join('');
}

/* ── Strategy catalog ─────────────────────────────── */
async function loadCatalog() {
  const d = await fetchJSON('catalog.json');
  const tbody = document.getElementById('catalog-body');
  if (!d || !d.strategies || d.strategies.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">L9 inventing strategies — check back soon</td></tr>';
    return;
  }
  tbody.innerHTML = d.strategies.map(s => {
    const stsCls  = s.status === 'ACTIVE' ? 'active' : 'retired';
    const is_m    = s.gauntlet_is || {};
    const liveWR  = s.live_wr != null ? fmtPct(s.live_wr) : '—';
    return `
    <tr>
      <td><b>${s.name}</b><br><span style="font-size:10px;color:var(--muted)">${s.family} · ${s.conditions} conds</span></td>
      <td>${selBadge(s.selection)}</td>
      <td><span class="badge badge-${stsCls}">${s.status}</span></td>
      <td>${fmtPct(is_m.win_rate)} IS / ${is_m.total_trades||0} bets</td>
      <td>${liveWR} (${s.live_n||0} live)</td>
      <td style="font-size:11px;color:var(--muted);max-width:200px">${s.rationale||'—'}</td>
    </tr>`;
  }).join('');
}

/* ── Upcoming fixtures ────────────────────────────── */
async function loadFixtures() {
  const d = await fetchJSON('fixtures.json');
  const tbody = document.getElementById('fixtures-body');
  if (!d || !d.fixtures || d.fixtures.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No upcoming fixtures fetched yet</td></tr>';
    return;
  }
  tbody.innerHTML = d.fixtures.slice(0,20).map(f => {
    const firing = f.active_strategies_firing || [];
    const firingTxt = firing.length ? `<span style="color:var(--accent);font-size:10px">▲ ${firing.join(', ')}</span>` : '';
    return `
    <tr>
      <td>${f.home} v ${f.away}<br><span style="font-size:10px;color:var(--muted)">${f.league}</span></td>
      <td style="font-size:11px">${(f.kickoff||'').replace('T',' ').slice(0,16)}</td>
      <td>${f.odds?.home ? fmt(f.odds.home) : '—'}</td>
      <td>${f.odds?.draw ? fmt(f.odds.draw) : '—'}</td>
      <td>${f.odds?.away ? fmt(f.odds.away) : '—'}</td>
      <td>${firingTxt}</td>
    </tr>`;
  }).join('');
}

/* ── Boot ─────────────────────────────────────────── */
async function init() {
  await Promise.all([
    loadPortfolio(),
    loadEquityCurve(),
    loadOpenBets(),
    loadRecentBets(),
    loadCatalog(),
    loadFixtures(),
  ]);
}

document.addEventListener('DOMContentLoaded', init);

// Auto-refresh every 5 minutes
setInterval(init, 5 * 60 * 1000);
