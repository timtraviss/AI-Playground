document.addEventListener('DOMContentLoaded', () => {
  initAdmin();
  loadUsers();
  loadUsage();
});

function initAdmin() {
  // Load scenario
  fetch('/api/admin/scenario')
    .then(r => r.json())
    .then(d => {
      document.getElementById('briefing').value = d.briefing || '';
      document.getElementById('task').value     = d.task || '';
    })
    .catch(() => { document.getElementById('briefing').placeholder = 'Failed to load.'; });

  loadModules();
}

// ── Scenario editor ────────────────────────────────
document.getElementById('btn-save-scenario').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-scenario');
  const msg = document.getElementById('msg-scenario');
  showMsg(msg, '', '');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const res = await fetch('/api/admin/scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        briefing: document.getElementById('briefing').value,
        task:     document.getElementById('task').value,
      }),
    });
    const data = await res.json();
    if (res.ok) showMsg(msg, 'Saved successfully.', 'success');
    else showMsg(msg, data.error || 'Save failed.', 'error');
  } catch { showMsg(msg, 'Network error.', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Save Scenario'; }
});

// ── Knowledge Base ─────────────────────────────────
document.getElementById('module-file').addEventListener('change', () => {
  const file = document.getElementById('module-file').files[0];
  document.getElementById('file-label').textContent = file?.name || 'Choose file…';
  if (file) {
    const match = file.name.match(/[_-]v(\d+)/i);
    if (match) {
      const nameInput = document.getElementById('module-name');
      const name = nameInput.value.trim();
      if (name && !/ v\d+$/i.test(name))
        nameInput.value = `${name} v${match[1]}`;
    }
  }
});

async function loadModules() {
  const body = document.getElementById('modules-body');
  try {
    const modules = await fetch('/api/tutor/modules').then(r => r.json());
    body.replaceChildren();
    if (!modules.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3; td.className = 'empty-state';
      td.textContent = 'No modules uploaded yet.';
      tr.appendChild(td); body.appendChild(tr);
      return;
    }
    for (const m of modules) {
      const tr = document.createElement('tr');
      tr.dataset.id = m.id;
      const tdName = document.createElement('td');
      tdName.textContent = m.name;
      const tdDate = document.createElement('td');
      tdDate.style.cssText = 'color:var(--text-muted);font-size:13px';
      tdDate.textContent = new Date(m.updatedAt).toLocaleDateString('en-NZ');
      const tdAction = document.createElement('td');
      const btn = document.createElement('button');
      btn.className = 'btn-danger'; btn.textContent = 'Delete';
      btn.addEventListener('click', () => deleteModule(m.id, m.name));
      tdAction.appendChild(btn);
      tr.append(tdName, tdDate, tdAction);
      body.appendChild(tr);
    }
  } catch {
    body.innerHTML = '<tr><td colspan="3" class="empty-state">Failed to load modules.</td></tr>';
  }
}

document.getElementById('btn-upload').addEventListener('click', async () => {
  const name     = document.getElementById('module-name').value.trim();
  const file     = document.getElementById('module-file').files[0];
  const msg      = document.getElementById('msg-upload');
  const btn      = document.getElementById('btn-upload');
  if (!name) return showMsg(msg, 'Module display name is required.', 'error');
  if (!file) return showMsg(msg, 'Please select a .docx file.', 'error');
  showMsg(msg, '', '');
  btn.disabled = true; btn.textContent = 'Converting…';
  const fd = new FormData();
  fd.append('module', file);
  fd.append('name', name);
  try {
    const res  = await fetch('/api/tutor/knowledge/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) {
      showMsg(msg, `"${name}" saved successfully.`, 'success');
      document.getElementById('module-name').value = '';
      document.getElementById('module-file').value = '';
      document.getElementById('file-label').textContent = 'Choose file…';
      loadModules();
    } else showMsg(msg, data.error || 'Upload failed.', 'error');
  } catch { showMsg(msg, 'Network error.', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Convert & Save Module'; }
});

async function deleteModule(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    const res  = await fetch(`/api/tutor/knowledge/${id}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (res.ok) loadModules();
    else alert(data.error || 'Delete failed.');
  } catch { alert('Network error.'); }
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = type ? `msg ${type}` : 'msg';
  if (type) {
    el.style.display = 'block';
    setTimeout(() => {
      // Optional: auto-hide success messages after 5s
      // if (type === 'success') el.style.display = 'none';
    }, 5000);
  } else {
    el.style.display = 'none';
  }
}

// ── Users card ────────────────────────────────────────────────────
let resetTargetId = null;

function relativeTime(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-NZ');
}

async function loadUsers() {
  try {
    const r = await fetch('/api/admin/users');
    const users = await r.json();
    const tbody = document.getElementById('users-tbody');
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-loading">No users yet.</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr data-id="${u.id}">
        <td><strong>${u.username}</strong></td>
        <td>${u.display_name}</td>
        <td><span class="role-pill ${u.role === 'Admin' ? 'admin' : 'other'}">${u.role}</span></td>
        <td style="color:var(--text-muted)">${relativeTime(u.last_login)}</td>
        <td>
          <div class="btn-row">
            <button class="btn-ghost btn-sm" onclick="openResetPw(${u.id}, '${u.display_name.replace(/'/g, "\\'")}')">Reset pw</button>
            <button class="btn-ghost btn-sm btn-danger" onclick="deleteUser(${u.id}, '${u.username}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    document.getElementById('users-tbody').innerHTML =
      `<tr><td colspan="5" class="table-loading">Error loading users: ${err.message}</td></tr>`;
  }
}

document.getElementById('add-user-btn').addEventListener('click', () => {
  document.getElementById('add-user-modal').style.display = 'flex';
  document.getElementById('add-user-error').style.display = 'none';
  ['new-username','new-display-name','new-password','new-role'].forEach(id => {
    document.getElementById(id).value = '';
  });
});

document.getElementById('add-user-cancel').addEventListener('click', () => {
  document.getElementById('add-user-modal').style.display = 'none';
});

document.getElementById('add-user-submit').addEventListener('click', async () => {
  const username = document.getElementById('new-username').value.trim();
  const displayName = document.getElementById('new-display-name').value.trim();
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value.trim() || 'Trainee';
  const errEl = document.getElementById('add-user-error');
  errEl.style.display = 'none';

  const r = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, displayName, password, role }),
  });
  const d = await r.json();
  if (r.ok) {
    document.getElementById('add-user-modal').style.display = 'none';
    loadUsers();
  } else {
    errEl.textContent = d.error;
    errEl.style.display = 'block';
  }
});

window.openResetPw = function(userId, displayName) {
  resetTargetId = userId;
  document.getElementById('reset-pw-name').textContent = `Resetting password for ${displayName}`;
  document.getElementById('reset-pw-input').value = '';
  document.getElementById('reset-pw-error').style.display = 'none';
  document.getElementById('reset-pw-modal').style.display = 'flex';
};

document.getElementById('reset-pw-cancel').addEventListener('click', () => {
  document.getElementById('reset-pw-modal').style.display = 'none';
});

document.getElementById('reset-pw-submit').addEventListener('click', async () => {
  const password = document.getElementById('reset-pw-input').value;
  const errEl = document.getElementById('reset-pw-error');
  const r = await fetch(`/api/admin/users/${resetTargetId}/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const d = await r.json();
  if (r.ok) {
    document.getElementById('reset-pw-modal').style.display = 'none';
  } else {
    errEl.textContent = d.error;
    errEl.style.display = 'block';
  }
});

window.deleteUser = async function(userId, username) {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  const r = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
  const d = await r.json();
  if (r.ok) loadUsers();
  else alert(d.error);
};

// ── Usage card ────────────────────────────────────────────────────
let usagePage = 1;
let activeUserId = null;

function fmtCost(v) { return '$' + Number(v).toFixed(4); }
function fmtTokens(v) {
  const n = Number(v);
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-NZ') + ' ' + d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
}

async function loadUsage() {
  const period = document.getElementById('usage-period').value;
  const params = new URLSearchParams({ period, page: usagePage });
  if (activeUserId) params.set('userId', activeUserId);
  try {
    const r = await fetch('/api/usage/admin?' + params);
    const d = await r.json();

    // Pills
    document.getElementById('up-cost').textContent = fmtCost(d.summary.total_cost);
    document.getElementById('up-tokens').textContent = fmtTokens(d.summary.total_tokens);
    document.getElementById('up-users').textContent = d.summary.active_users;
    document.getElementById('up-sessions').textContent = d.summary.sessions;

    // By-user cards
    const byUserEl = document.getElementById('usage-by-user');
    byUserEl.innerHTML = d.byUser.map(u => `
      <div class="user-usage-card" onclick="filterByUser(${u.id})">
        <div class="user-usage-avatar">${(u.display_name||u.username)[0].toUpperCase()}</div>
        <div class="user-usage-meta">
          <div class="user-usage-name">${u.display_name}</div>
          <div class="user-usage-sub">${u.sessions} sessions · ${u.top_tool || 'various'}</div>
        </div>
        <div class="user-usage-cost">
          <div class="user-usage-cost-val">${fmtCost(u.cost)}</div>
          <div class="user-usage-cost-tokens">${fmtTokens(u.tokens)} tokens</div>
        </div>
      </div>
    `).join('') || '<p style="color:var(--text-muted,#64748b);text-align:center;padding:24px">No usage data yet.</p>';

    // Log table
    const tbody = document.getElementById('usage-log-tbody');
    tbody.innerHTML = d.log.map(row => `
      <tr>
        <td><strong>${row.username || '—'}</strong></td>
        <td>${row.tool}</td>
        <td><span style="font-size:11px;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px">${row.model}</span></td>
        <td style="font-size:12px;color:var(--text-muted,#64748b)">${fmtTime(row.ts)}</td>
        <td style="font-size:12px;color:var(--text-muted,#64748b)">${row.input_tokens} / ${row.output_tokens} / ${row.cache_read_tokens}</td>
        <td style="color:var(--gold,#e8c96a);font-weight:600">${fmtCost(row.cost_usd)}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="table-loading">No sessions.</td></tr>';

    // Pagination
    const pages = Math.ceil(d.total / d.limit);
    const pagEl = document.getElementById('usage-pagination');
    pagEl.innerHTML = Array.from({ length: Math.min(pages, 10) }, (_, i) =>
      `<button class="page-btn${i+1 === usagePage ? ' active' : ''}" onclick="goPage(${i+1})">${i+1}</button>`
    ).join('');
  } catch (err) {
    console.error('Usage load error', err);
  }
}

window.filterByUser = function(userId) {
  activeUserId = activeUserId === userId ? null : userId;
  usagePage = 1;
  switchTab('log');
  loadUsage();
};

window.goPage = function(p) { usagePage = p; loadUsage(); };

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.getElementById('usage-tab-summary').style.display = name === 'summary' ? '' : 'none';
  document.getElementById('usage-tab-log').style.display = name === 'log' ? '' : 'none';
}

document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.getElementById('usage-period').addEventListener('change', () => { usagePage = 1; loadUsage(); });
