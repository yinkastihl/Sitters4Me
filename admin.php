<?php
// ── Admin Portal — Sitters4Me ─────────────────────────────────
// Password protected via session. Change ADMIN_PASSWORD below.
// Upload to: https://sitters4me.com/admin.php

define('ADMIN_PASSWORD', 'S4M_Admin_2026!');
define('JOBS_API',       'https://sitters4me.com/api/jobs.php');
define('ADMIN_KEY',      'S4M_Admin_2026!');

session_start();

// ── Handle logout ──
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: admin.php');
    exit;
}

// ── Handle login ──
$loginError = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if ($_POST['password'] === ADMIN_PASSWORD) {
        $_SESSION['admin_auth'] = true;
        header('Location: admin.php');
        exit;
    } else {
        $loginError = 'Incorrect password.';
    }
}

$isAuthed = !empty($_SESSION['admin_auth']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sitters4Me — Admin Portal</title>
<style>
  :root {
    --primary: #6C63FF;
    --primary-dark: #574fd6;
    --danger: #e74c3c;
    --danger-dark: #c0392b;
    --success: #27ae60;
    --warning: #f39c12;
    --info: #2980b9;
    --bg: #f4f6fb;
    --card: #ffffff;
    --border: #e0e4ef;
    --text: #1a1a2e;
    --muted: #6b7280;
    --radius: 10px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: var(--bg); color: var(--text); font-size: 14px; }

  /* ── LOGIN ── */
  .login-wrap { min-height: 100vh; display: flex; align-items: center;
                justify-content: center; background: linear-gradient(135deg,#6C63FF,#48d4c7); }
  .login-box  { background: #fff; border-radius: 16px; padding: 48px 40px;
                width: 360px; box-shadow: 0 8px 40px rgba(0,0,0,0.15); text-align: center; }
  .login-box h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; color: var(--primary); }
  .login-box p  { color: var(--muted); margin-bottom: 28px; font-size: 13px; }
  .login-box input { width: 100%; padding: 12px 14px; border: 1.5px solid var(--border);
                     border-radius: var(--radius); font-size: 14px; margin-bottom: 12px;
                     outline: none; transition: border .2s; }
  .login-box input:focus { border-color: var(--primary); }
  .login-box button { width: 100%; padding: 13px; background: var(--primary); color: #fff;
                      border: none; border-radius: var(--radius); font-size: 15px;
                      font-weight: 600; cursor: pointer; transition: background .2s; }
  .login-box button:hover { background: var(--primary-dark); }
  .login-error { color: var(--danger); font-size: 13px; margin-bottom: 10px; }

  /* ── LAYOUT ── */
  .topbar { background: var(--primary); color: #fff; padding: 14px 28px;
            display: flex; align-items: center; justify-content: space-between;
            position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .topbar h1 { font-size: 17px; font-weight: 700; }
  .topbar-right { display: flex; align-items: center; gap: 16px; }
  .topbar a { color: rgba(255,255,255,.8); text-decoration: none; font-size: 13px; }
  .topbar a:hover { color: #fff; }

  .main { max-width: 1300px; margin: 0 auto; padding: 28px 20px; }

  /* ── STATS ── */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px,1fr));
                gap: 14px; margin-bottom: 28px; }
  .stat-card  { background: var(--card); border-radius: var(--radius); padding: 18px 16px;
                box-shadow: 0 1px 4px rgba(0,0,0,.06); border: 1px solid var(--border); text-align: center; }
  .stat-card .val  { font-size: 28px; font-weight: 700; }
  .stat-card .lbl  { font-size: 11px; color: var(--muted); margin-top: 4px; text-transform: uppercase; letter-spacing: .5px; }
  .stat-card.red   .val { color: var(--danger); }
  .stat-card.green .val { color: var(--success); }
  .stat-card.blue  .val { color: var(--info); }
  .stat-card.purple .val{ color: var(--primary); }
  .stat-card.orange .val{ color: var(--warning); }

  /* ── PANEL ── */
  .panel { background: var(--card); border-radius: var(--radius); border: 1px solid var(--border);
           box-shadow: 0 1px 4px rgba(0,0,0,.06); margin-bottom: 28px; }
  .panel-header { padding: 16px 20px; border-bottom: 1px solid var(--border);
                  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
  .panel-header h2 { font-size: 15px; font-weight: 700; }

  /* ── CONTROLS ── */
  .controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .controls input, .controls select {
    padding: 8px 12px; border: 1.5px solid var(--border); border-radius: 8px;
    font-size: 13px; outline: none; transition: border .2s; background: #fff; }
  .controls input:focus, .controls select:focus { border-color: var(--primary); }
  .controls input { width: 160px; }

  /* ── BUTTONS ── */
  .btn { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer;
         font-size: 13px; font-weight: 600; transition: opacity .2s; display: inline-flex;
         align-items: center; gap: 6px; }
  .btn:hover { opacity: .85; }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn-primary { background: var(--primary); color: #fff; }
  .btn-danger  { background: var(--danger); color: #fff; }
  .btn-warning { background: var(--warning); color: #fff; }
  .btn-success { background: var(--success); color: #fff; }
  .btn-sm      { padding: 5px 10px; font-size: 12px; border-radius: 6px; }

  /* ── TABLE ── */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f8f9fc; font-size: 11px; font-weight: 700; color: var(--muted);
       text-transform: uppercase; letter-spacing: .5px; padding: 10px 14px;
       border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
  td { padding: 11px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fafbff; }

  /* ── STATUS BADGES ── */
  .badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 11px;
           font-weight: 700; white-space: nowrap; }
  .badge-open     { background: #fff3cd; color: #856404; }
  .badge-hired    { background: #cfe2ff; color: #084298; }
  .badge-arrived  { background: #d1ecf1; color: #0c5460; }
  .badge-progress { background: #d4edda; color: #155724; }
  .badge-complete { background: #d4edda; color: #155724; }
  .badge-cancelled{ background: #f8d7da; color: #721c24; }
  .badge-closed   { background: #e2e3e5; color: #383d41; }
  .badge-offered  { background: #e2cfff; color: #4a1f99; }

  /* ── PAGINATION ── */
  .pagination { display: flex; gap: 6px; align-items: center; padding: 14px 20px;
                border-top: 1px solid var(--border); justify-content: center; }
  .page-btn { padding: 5px 11px; border: 1.5px solid var(--border); border-radius: 7px;
              background: #fff; cursor: pointer; font-size: 13px; color: var(--text); transition: all .2s; }
  .page-btn:hover { border-color: var(--primary); color: var(--primary); }
  .page-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
  .page-btn:disabled { opacity: .4; cursor: not-allowed; }

  /* ── MODAL ── */
  .modal-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5);
                    z-index: 200; align-items: center; justify-content: center; }
  .modal-backdrop.open { display: flex; }
  .modal { background: #fff; border-radius: 14px; padding: 28px; width: 520px;
           max-width: 95vw; max-height: 90vh; overflow-y: auto;
           box-shadow: 0 8px 40px rgba(0,0,0,.2); }
  .modal h3 { font-size: 16px; font-weight: 700; margin-bottom: 18px; }
  .modal-close { float: right; background: none; border: none; font-size: 20px;
                 cursor: pointer; color: var(--muted); margin-top: -4px; }
  .form-group { margin-bottom: 14px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--muted);
                      text-transform: uppercase; letter-spacing: .4px; margin-bottom: 5px; }
  .form-group input, .form-group select, .form-group textarea {
    width: 100%; padding: 10px 12px; border: 1.5px solid var(--border);
    border-radius: 8px; font-size: 14px; outline: none; transition: border .2s;
    font-family: inherit; }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
    border-color: var(--primary); }
  .form-group textarea { resize: vertical; min-height: 80px; }
  .modal-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }

  .info-row { display: flex; gap: 8px; margin-bottom: 8px; font-size: 13px; }
  .info-label { color: var(--muted); width: 120px; flex-shrink: 0; font-weight: 600; }

  .toast { position: fixed; bottom: 24px; right: 24px; background: #1a1a2e; color: #fff;
           padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 600;
           opacity: 0; transform: translateY(10px); transition: all .3s; z-index: 999;
           max-width: 320px; }
  .toast.show { opacity: 1; transform: translateY(0); }
  .toast.error { background: var(--danger); }
  .toast.success { background: var(--success); }

  .empty { text-align: center; padding: 48px 20px; color: var(--muted); }
  .empty .icon { font-size: 36px; margin-bottom: 8px; }

  .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.4);
             border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 640px) {
    .stats-grid { grid-template-columns: repeat(2,1fr); }
    .panel-header { flex-direction: column; align-items: flex-start; }
  }
</style>
</head>
<body>

<?php if (!$isAuthed): ?>
<!-- ── LOGIN SCREEN ── -->
<div class="login-wrap">
  <div class="login-box">
    <h1>🍼 Sitters4Me</h1>
    <p>Admin Portal — restricted access</p>
    <?php if ($loginError): ?>
      <div class="login-error"><?= htmlspecialchars($loginError) ?></div>
    <?php endif; ?>
    <form method="POST">
      <input type="password" name="password" placeholder="Admin password" autofocus required>
      <button type="submit">Sign In →</button>
    </form>
  </div>
</div>

<?php else: ?>
<!-- ── ADMIN DASHBOARD ── -->

<div class="topbar">
  <h1>🍼 Sitters4Me Admin</h1>
  <div class="topbar-right">
    <span id="lastRefresh" style="font-size:12px;opacity:.7"></span>
    <a href="?logout=1">Sign Out</a>
  </div>
</div>

<div class="main">

  <!-- STATS -->
  <div class="stats-grid" id="statsGrid">
    <div class="stat-card"><div class="val">—</div><div class="lbl">Total Jobs</div></div>
    <div class="stat-card red"><div class="val">—</div><div class="lbl">Active Jobs</div></div>
    <div class="stat-card blue"><div class="val">—</div><div class="lbl">Today's Jobs</div></div>
    <div class="stat-card green"><div class="val">—</div><div class="lbl">Completed</div></div>
    <div class="stat-card orange"><div class="val">—</div><div class="lbl">Cancelled</div></div>
    <div class="stat-card purple"><div class="val">—</div><div class="lbl">Online Sitters</div></div>
    <div class="stat-card blue"><div class="val">—</div><div class="lbl">Total Parents</div></div>
    <div class="stat-card purple"><div class="val">—</div><div class="lbl">Total Sitters</div></div>
    <div class="stat-card orange"><div class="val">—</div><div class="lbl">Pending Payouts</div></div>
  </div>

  <!-- JOBS PANEL -->
  <div class="panel">
    <div class="panel-header">
      <h2>📋 Jobs</h2>
      <div class="controls">
        <input type="number" id="searchId" placeholder="Job ID" min="1">
        <select id="filterStatus">
          <option value="all">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Sitter hired">Sitter Hired</option>
          <option value="Sitter offered">Sitter Offered</option>
          <option value="Sitter arrived">Sitter Arrived</option>
          <option value="In progress">In Progress</option>
          <option value="Complete">Complete</option>
          <option value="Cancelled">Cancelled</option>
          <option value="Closed">Closed</option>
        </select>
        <button class="btn btn-primary" onclick="loadJobs(1)">🔍 Search</button>
        <button class="btn btn-danger" id="closeAllBtn" onclick="closeAllActive()">
          ⛔ Close All Active
        </button>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Job ID</th>
            <th>Status</th>
            <th>Parent</th>
            <th>Sitter</th>
            <th>Kids</th>
            <th>Posted</th>
            <th>Scheduled</th>
            <th>Charge</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="jobsBody">
          <tr><td colspan="9" class="empty"><div class="icon">⏳</div>Loading jobs…</td></tr>
        </tbody>
      </table>
    </div>
    <div class="pagination" id="pagination"></div>
  </div>

</div><!-- /main -->

<!-- ── EDIT MODAL ── -->
<div class="modal-backdrop" id="editModal">
  <div class="modal">
    <h3>
      ✏️ Edit Job <span id="modalJobId"></span>
      <button class="modal-close" onclick="closeModal('editModal')">×</button>
    </h3>
    <div id="modalJobInfo"></div>
    <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)">
    <div class="form-group">
      <label>Status</label>
      <select id="editStatus">
        <option value="Open">Open</option>
        <option value="Sitter hired">Sitter Hired</option>
        <option value="Sitter offered">Sitter Offered</option>
        <option value="Sitter arrived">Sitter Arrived</option>
        <option value="In progress">In Progress</option>
        <option value="Complete">Complete</option>
        <option value="Cancelled">Cancelled</option>
        <option value="Closed">Closed</option>
      </select>
    </div>
    <div class="form-group">
      <label>Kids</label>
      <input type="number" id="editKids" min="1" max="10">
    </div>
    <div class="form-group">
      <label>Charge Amount ($)</label>
      <input type="number" id="editCharge" step="0.01" min="0">
    </div>
    <div class="form-group">
      <label>Admin Notes</label>
      <textarea id="editNotes" placeholder="Internal notes (not shown to users)"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal('editModal')" style="background:#f3f4f6">Cancel</button>
      <button class="btn btn-primary" onclick="saveJobEdit()">💾 Save Changes</button>
    </div>
  </div>
</div>

<!-- ── CANCEL MODAL ── -->
<div class="modal-backdrop" id="cancelModal">
  <div class="modal">
    <h3>
      ❌ Cancel Job <span id="cancelJobId"></span>
      <button class="modal-close" onclick="closeModal('cancelModal')">×</button>
    </h3>
    <p style="color:var(--muted);margin-bottom:16px;font-size:13px">
      This will cancel the job and notify the parent and sitter via push notification.
    </p>
    <div class="form-group">
      <label>Reason (sent in push notification)</label>
      <input type="text" id="cancelReason" value="Cancelled by admin" placeholder="Reason for cancellation">
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal('cancelModal')" style="background:#f3f4f6">Back</button>
      <button class="btn btn-danger" onclick="confirmCancel()">⛔ Confirm Cancel</button>
    </div>
  </div>
</div>

<!-- TOAST -->
<div class="toast" id="toast"></div>

<script>
const API      = '<?= JOBS_API ?>';
const ADMIN_KEY= '<?= ADMIN_KEY ?>';

let currentPage = 1;
let editingJobId = null;
let cancellingJobId = null;

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadJobs(1);

  // Search on Enter
  document.getElementById('searchId').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadJobs(1);
  });
  document.getElementById('filterStatus').addEventListener('change', () => loadJobs(1));
});

// ── API HELPER ───────────────────────────────────────────────
async function api(action, body = {}) {
  const res = await fetch(`${API}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, admin_key: ADMIN_KEY }),
  });
  return res.json();
}

// ── STATS ────────────────────────────────────────────────────
async function loadStats() {
  try {
    const d = await api('admin_stats');
    if (!d.success) return;
    const s = d.data;
    const labels = [
      ['total_jobs','—'], ['active_jobs','red'], ['today_jobs','blue'],
      ['completed_jobs','green'], ['cancelled_jobs','orange'],
      ['online_sitters','purple'], ['total_parents','blue'],
      ['total_sitters','purple'], ['pending_payouts','orange'],
    ];
    const cards = document.querySelectorAll('#statsGrid .stat-card .val');
    const keys  = ['total_jobs','active_jobs','today_jobs','completed_jobs',
                   'cancelled_jobs','online_sitters','total_parents','total_sitters','pending_payouts'];
    keys.forEach((k, i) => { if (cards[i]) cards[i].textContent = s[k] ?? '—'; });

    document.getElementById('lastRefresh').textContent =
      'Refreshed ' + new Date().toLocaleTimeString();
  } catch(e) { /* silent */ }
}

// ── JOBS TABLE ───────────────────────────────────────────────
async function loadJobs(page = 1) {
  currentPage = page;
  const jobId  = parseInt(document.getElementById('searchId').value) || 0;
  const status = document.getElementById('filterStatus').value;

  document.getElementById('jobsBody').innerHTML =
    '<tr><td colspan="9" class="empty"><div class="icon">⏳</div>Loading…</td></tr>';
  document.getElementById('pagination').innerHTML = '';

  try {
    const d = await api('admin_list_jobs', { job_id: jobId || undefined, status, page });
    if (!d.success) { showToast(d.error || 'Failed to load jobs', 'error'); return; }

    const { jobs, total, total_pages } = d.data;
    renderJobsTable(jobs);
    renderPagination(total_pages, page);
  } catch(e) {
    showToast('Network error loading jobs', 'error');
  }
}

function statusBadge(status) {
  const map = {
    'Open':           'badge-open',
    'Sitter hired':   'badge-hired',
    'Sitter offered': 'badge-offered',
    'Sitter arrived': 'badge-arrived',
    'In progress':    'badge-progress',
    'Complete':       'badge-complete',
    'Cancelled':      'badge-cancelled',
    'Closed':         'badge-closed',
  };
  const cls = map[status] || 'badge-closed';
  return `<span class="badge ${cls}">${status || '—'}</span>`;
}

function fmtDate(dt) {
  if (!dt) return '—';
  const d = new Date(dt.replace(' ', 'T') + (dt.includes('Z') ? '' : 'Z'));
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
}

function renderJobsTable(jobs) {
  if (!jobs || !jobs.length) {
    document.getElementById('jobsBody').innerHTML =
      '<tr><td colspan="9" class="empty"><div class="icon">📭</div>No jobs found</td></tr>';
    return;
  }
  const rows = jobs.map(j => {
    const parent = `${j.parent_fname || ''} ${j.parent_lname || ''}`.trim() || `Parent #${j.parent_id}`;
    const sitter = j.sitter_id
      ? `${j.sitter_fname || ''} ${j.sitter_lname || ''}`.trim() || `Sitter #${j.sitter_id}`
      : '<span style="color:var(--muted)">Unassigned</span>';
    const canCancel = !['Complete','Cancelled','Closed'].includes(j.status);
    return `<tr>
      <td><strong>#${j.id}</strong></td>
      <td>${statusBadge(j.status)}</td>
      <td>${escHtml(parent)}<br><small style="color:var(--muted)">${escHtml(j.parent_email||'')}</small></td>
      <td>${typeof sitter === 'string' && sitter.includes('Unassigned') ? sitter : escHtml(sitter)}</td>
      <td style="text-align:center">${j.kids || 1}</td>
      <td style="white-space:nowrap">${fmtDate(j.post_time)}</td>
      <td style="white-space:nowrap">${j.scheduled_time ? fmtDate(j.scheduled_time) : '<span style="color:var(--muted)">Live</span>'}</td>
      <td>$${parseFloat(j.charge_amt || 0).toFixed(2)}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openEdit(${JSON.stringify(j).replace(/"/g,'&quot;')})">✏️ Edit</button>
        ${canCancel ? `<button class="btn btn-danger btn-sm" style="margin-left:4px" onclick="openCancel(${j.id})">⛔ Cancel</button>` : ''}
      </td>
    </tr>`;
  });
  document.getElementById('jobsBody').innerHTML = rows.join('');
}

function renderPagination(totalPages, current) {
  if (totalPages <= 1) { document.getElementById('pagination').innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="loadJobs(${current-1})" ${current===1?'disabled':''}>←</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - current) <= 2) {
      html += `<button class="page-btn ${i===current?'active':''}" onclick="loadJobs(${i})">${i}</button>`;
    } else if (Math.abs(i - current) === 3) {
      html += `<span style="color:var(--muted);padding:0 4px">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="loadJobs(${current+1})" ${current===totalPages?'disabled':''}>→</button>`;
  document.getElementById('pagination').innerHTML = html;
}

// ── EDIT MODAL ───────────────────────────────────────────────
function openEdit(job) {
  editingJobId = job.id;
  document.getElementById('modalJobId').textContent = `#${job.id}`;

  const parent = `${job.parent_fname||''} ${job.parent_lname||''}`.trim();
  const sitter = job.sitter_id
    ? `${job.sitter_fname||''} ${job.sitter_lname||''}`.trim() || `Sitter #${job.sitter_id}`
    : 'Unassigned';

  document.getElementById('modalJobInfo').innerHTML = `
    <div class="info-row"><span class="info-label">Job ID</span><span>#${job.id}</span></div>
    <div class="info-row"><span class="info-label">Parent</span><span>${escHtml(parent)} (${escHtml(job.parent_email||'')})</span></div>
    <div class="info-row"><span class="info-label">Sitter</span><span>${escHtml(sitter)}</span></div>
    <div class="info-row"><span class="info-label">Address</span><span>${escHtml(job.address||'—')}</span></div>
    <div class="info-row"><span class="info-label">Posted</span><span>${fmtDate(job.post_time)}</span></div>
    ${job.scheduled_time ? `<div class="info-row"><span class="info-label">Scheduled</span><span>${fmtDate(job.scheduled_time)}</span></div>` : ''}
    ${job.children_ages ? `<div class="info-row"><span class="info-label">Child Ages</span><span>${job.children_ages}</span></div>` : ''}
  `;

  document.getElementById('editStatus').value  = job.status || 'Open';
  document.getElementById('editKids').value    = job.kids || 1;
  document.getElementById('editCharge').value  = parseFloat(job.charge_amt || 0).toFixed(2);
  document.getElementById('editNotes').value   = job.notes || '';

  document.getElementById('editModal').classList.add('open');
}

async function saveJobEdit() {
  const body = {
    job_id:     editingJobId,
    status:     document.getElementById('editStatus').value,
    kids:       parseInt(document.getElementById('editKids').value) || undefined,
    charge_amt: parseFloat(document.getElementById('editCharge').value) || undefined,
    notes:      document.getElementById('editNotes').value || undefined,
  };

  try {
    const d = await api('admin_update_job', body);
    if (d.success) {
      showToast(`Job #${editingJobId} updated ✓`, 'success');
      closeModal('editModal');
      loadJobs(currentPage);
      loadStats();
    } else {
      showToast(d.error || 'Update failed', 'error');
    }
  } catch(e) { showToast('Network error', 'error'); }
}

// ── CANCEL MODAL ─────────────────────────────────────────────
function openCancel(jobId) {
  cancellingJobId = jobId;
  document.getElementById('cancelJobId').textContent = `#${jobId}`;
  document.getElementById('cancelReason').value = 'Cancelled by admin';
  document.getElementById('cancelModal').classList.add('open');
}

async function confirmCancel() {
  const reason = document.getElementById('cancelReason').value.trim() || 'Cancelled by admin';
  try {
    const d = await api('admin_cancel_job', { job_id: cancellingJobId, reason });
    if (d.success) {
      showToast(`Job #${cancellingJobId} cancelled ✓`, 'success');
      closeModal('cancelModal');
      loadJobs(currentPage);
      loadStats();
    } else {
      showToast(d.error || 'Cancel failed', 'error');
    }
  } catch(e) { showToast('Network error', 'error'); }
}

// ── CLOSE ALL ACTIVE ─────────────────────────────────────────
async function closeAllActive() {
  if (!confirm('⚠️ This will CANCEL all active jobs (Open, Sitter hired, In progress, etc.) and notify all parents and sitters.\n\nAre you sure?')) return;

  const btn = document.getElementById('closeAllBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Closing…';

  try {
    const d = await api('admin_close_all_active');
    if (d.success) {
      showToast(d.message || 'All active jobs closed ✓', 'success');
      loadJobs(currentPage);
      loadStats();
    } else {
      showToast(d.error || 'Failed', 'error');
    }
  } catch(e) {
    showToast('Network error', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '⛔ Close All Active';
  }
}

// ── MODAL HELPERS ────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

// ── TOAST ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── UTILS ────────────────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── AUTO REFRESH STATS ───────────────────────────────────────
setInterval(loadStats, 60_000);
</script>

<?php endif; ?>
</body>
</html>
