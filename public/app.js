// ── State ────────────────────────────────────────────────────────────────
let token = localStorage.getItem('f1_token');
let currentUser = JSON.parse(localStorage.getItem('f1_user') || 'null');
let allDrivers = [];
let selectedDriverIds = [];
let currentPicks = { driver1: null, driver2: null };
let picksLocked = false;
let adminRaces = [];
let teamRacesData = [];
let expandedRaceIds = new Set();
let raceDetailSort = { col: 'race_pts', dir: 'desc' };

// ── API helper ───────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Forespørsel feilet');
  return data;
}

// ── Toast ────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

// ── Auth ─────────────────────────────────────────────────────────────────
function showAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

document.getElementById('btn-login').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) return showToast('Fyll inn brukernavn og passord', 'error');
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    saveSession(data);
    initApp();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});

document.getElementById('btn-register').addEventListener('click', async () => {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm  = document.getElementById('reg-confirm').value;
  if (!username || !password) return showToast('Fyll inn alle felt', 'error');
  if (password !== confirm) return showToast('Passordene stemmer ikke overens', 'error');
  try {
    const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    saveSession(data);
    if (data.is_admin) showToast('Velkommen, admin!', 'success');
    else showToast('Konto opprettet!', 'success');
    initApp();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

function saveSession(data) {
  token = data.token;
  currentUser = { username: data.username, is_admin: data.is_admin };
  localStorage.setItem('f1_token', token);
  localStorage.setItem('f1_user', JSON.stringify(currentUser));
}

function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('f1_token');
  localStorage.removeItem('f1_user');
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

// ── App init ─────────────────────────────────────────────────────────────
async function initApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('header-user').textContent = currentUser.username;
  if (currentUser.is_admin) document.getElementById('nav-admin').style.display = '';
  await showScreen('team');
}

// ── Navigation ────────────────────────────────────────────────────────────
async function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');

  if (name === 'team')    await loadTeam();
  if (name === 'drivers') await loadDrivers();
  if (name === 'lb')      await loadStandings();
  if (name === 'admin')   await loadAdmin();
  if (name === 'cal')     await loadCalendar();
  // 'points' screen is static HTML, no load needed
}

// ── Mitt lag ──────────────────────────────────────────────────────────────
async function loadTeam() {
  try {
    const [picks, races, settings, standings] = await Promise.all([
      api('/api/picks/my'),
      api('/api/league/my-races'),
      api('/api/league/settings'),
      api('/api/league/standings'),
    ]);

    picksLocked = settings.picks_locked;
    updateHeaderPill(picksLocked);

    const myStanding = standings.find(s => s.is_me);
    const rank = standings.findIndex(s => s.is_me) + 1;
    document.getElementById('team-pts').textContent = myStanding?.score ?? '0';
    document.getElementById('team-rank').textContent = rank > 0 ? `#${rank}` : '—';
    document.getElementById('team-swaps').textContent = `${picks.swaps_used ?? 0}/10`;

    const noPicks = !picks.driver1 && !picks.driver2;
    document.getElementById('no-picks-msg').style.display = noPicks ? 'block' : 'none';

    if (!noPicks) {
      document.getElementById('team-drivers').innerHTML =
        [picks.driver1, picks.driver2].filter(Boolean).map(driverCardHTML).join('');
    }

    teamRacesData = races;
    renderTeamRaces();

    const nextEl = document.getElementById('team-next');
    if (settings.next_race) {
      const nr = settings.next_race;
      const pill = picksLocked
        ? '<div class="locked-pill">🔒 LÅST</div>'
        : '<div class="open-pill">✓ ÅPENT</div>';
      nextEl.innerHTML = `
        <div class="next-race">
          <div>
            <div class="next-round">Runde ${nr.round}</div>
            <div class="next-name">${nr.name}</div>
            <div class="next-detail">${nr.circuit} · ${formatDate(nr.date)}</div>
          </div>
          ${pill}
        </div>`;
    } else {
      nextEl.innerHTML = '<div class="empty">Sesongen er over</div>';
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function driverCardHTML(d) {
  return `
    <div class="driver-card" style="border-left-color:${d.team_color}">
      <div class="driver-num" style="color:${d.team_color};text-shadow:0 0 10px ${d.team_color}">${d.number}</div>
      <div class="driver-name">${d.name}</div>
      <div class="driver-team" style="color:${d.team_color}">${d.team}</div>
      <div class="driver-hf">
        <span>${d.championship_pts} pts</span>
        <span class="hf">×${d.handicap}</span>
      </div>
    </div>`;
}

function renderTeamRaces() {
  const racesEl = document.getElementById('team-races');
  if (teamRacesData.length === 0) {
    racesEl.innerHTML = '<div class="empty">Ingen fullførte race ennå</div>';
    return;
  }

  racesEl.innerHTML = teamRacesData.map(r => {
    const expanded = expandedRaceIds.has(r.race_id);

    const drivers = [
      {
        name: r.driver1_name,
        race_pts: r.driver1_race_pts ?? 0,
        hc: r.driver1_hc ?? 1,
        hc_pts: +((r.driver1_race_pts ?? 0) * (r.driver1_hc ?? 1)).toFixed(2),
      },
      {
        name: r.driver2_name,
        race_pts: r.driver2_race_pts ?? 0,
        hc: r.driver2_hc ?? 1,
        hc_pts: +((r.driver2_race_pts ?? 0) * (r.driver2_hc ?? 1)).toFixed(2),
      },
    ];

    drivers.sort((a, b) => {
      const av = a[raceDetailSort.col], bv = b[raceDetailSort.col];
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return raceDetailSort.dir === 'asc' ? cmp : -cmp;
    });

    const arrow = col => raceDetailSort.col === col ? (raceDetailSort.dir === 'asc' ? ' ▲' : ' ▼') : '';

    const detailHTML = expanded ? `
      <div class="race-detail" onclick="event.stopPropagation()">
        <table class="detail-table">
          <thead><tr>
            <th onclick="sortRaceDetail('name')">Racer${arrow('name')}</th>
            <th onclick="sortRaceDetail('race_pts')">Race pts${arrow('race_pts')}</th>
            <th onclick="sortRaceDetail('hc')">HC ×${arrow('hc')}</th>
            <th onclick="sortRaceDetail('hc_pts')">HC pts${arrow('hc_pts')}</th>
          </tr></thead>
          <tbody>
            ${drivers.map(d => `
              <tr>
                <td>${d.name}</td>
                <td>${d.race_pts}</td>
                <td>${d.hc}</td>
                <td style="color:var(--cyan);font-family:'VT323',monospace;font-size:1rem">${d.hc_pts}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '';

    return `
      <div class="race-row expandable" onclick="toggleRaceDetail(${r.race_id})">
        <div><span class="race-round">R${r.round}</span><span class="race-name">${r.race_name}</span></div>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="race-pts">+${r.score} pts</div>
          <span style="color:var(--muted);font-size:0.7rem;line-height:1">${expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      ${detailHTML}`;
  }).join('');
}

function toggleRaceDetail(raceId) {
  if (expandedRaceIds.has(raceId)) expandedRaceIds.delete(raceId);
  else expandedRaceIds.add(raceId);
  renderTeamRaces();
}

function sortRaceDetail(col) {
  if (raceDetailSort.col === col) {
    raceDetailSort.dir = raceDetailSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    raceDetailSort.col = col;
    raceDetailSort.dir = col === 'name' ? 'asc' : 'desc';
  }
  renderTeamRaces();
}

// ── Sjåfører / Valg ───────────────────────────────────────────────────────
async function loadDrivers() {
  try {
    const [drivers, picks, settings] = await Promise.all([
      api('/api/picks/drivers'),
      api('/api/picks/my'),
      api('/api/league/settings'),
    ]);

    allDrivers = drivers;
    picksLocked = settings.picks_locked;
    currentPicks = picks;

    selectedDriverIds = [];
    if (picks.driver1) selectedDriverIds.push(picks.driver1.id);
    if (picks.driver2) selectedDriverIds.push(picks.driver2.id);

    document.getElementById('picks-lock-banner').style.display = picksLocked ? 'block' : 'none';
    document.getElementById('picks-open-banner').style.display = picksLocked ? 'none' : 'block';

    renderPicksGrid();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderPicksGrid() {
  const count = selectedDriverIds.length;
  const countEl = document.getElementById('picks-count');
  countEl.textContent = `${count}/2${count === 2 ? ' ✓' : ''}`;

  document.getElementById('drivers-grid').innerHTML = allDrivers.map(d => {
    const sel = selectedDriverIds.includes(d.id);
    return `
      <div class="pick-card ${sel ? 'selected' : ''}" onclick="togglePick(${d.id})">
        ${sel ? '<div class="pick-check">✓</div>' : ''}
        <div style="font-family:'VT323',monospace;font-size:2rem;color:${d.team_color};text-shadow:0 0 8px ${d.team_color}">${d.number}</div>
        <div class="driver-name">${d.short_name}</div>
        <div class="driver-team" style="color:${d.team_color}">${d.team}</div>
        <div class="pick-hf">
          <span>${d.championship_pts} pts</span>
          <span class="mult">×${d.handicap}</span>
        </div>
      </div>`;
  }).join('');

  const saveBtn = document.getElementById('btn-save-picks');
  saveBtn.disabled = picksLocked || count !== 2;
  if (picksLocked) {
    saveBtn.textContent = '🔒 VALG LÅST — RACE WEEKEND';
  } else if (count < 2) {
    saveBtn.textContent = `VELG ${2 - count} SJÅFØR${2 - count === 1 ? '' : 'ER'} TIL`;
  } else {
    saveBtn.textContent = 'LAGRE VALG';
  }
}

function togglePick(driverId) {
  if (picksLocked) return;
  const idx = selectedDriverIds.indexOf(driverId);
  if (idx > -1) {
    selectedDriverIds.splice(idx, 1);
  } else {
    if (selectedDriverIds.length >= 2) {
      showToast('Allerede 2 valgt — fjern en først', 'error');
      return;
    }
    selectedDriverIds.push(driverId);
  }
  renderPicksGrid();
}

async function savePicks() {
  if (selectedDriverIds.length !== 2) return;
  try {
    await api('/api/picks', {
      method: 'PUT',
      body: JSON.stringify({ driver1_id: selectedDriverIds[0], driver2_id: selectedDriverIds[1] }),
    });
    showToast('Valg lagret!', 'success');
    await loadDrivers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Tabell ────────────────────────────────────────────────────────────────
async function loadStandings() {
  try {
    const [standings, settings] = await Promise.all([
      api('/api/league/standings'),
      api('/api/league/settings'),
    ]);

    document.getElementById('lb-sub').textContent =
      `${standings.length} spillere · Etter runde ${settings.completed_races}`;

    const medals = ['🥇', '🥈', '🥉'];
    const colors = ['gold', 'silver', 'bronze'];

    document.getElementById('lb-list').innerHTML = standings.map((s, i) => {
      const rankLabel = i < 3
        ? `<div class="lb-rank ${colors[i]}">${medals[i]}</div>`
        : `<div class="lb-rank" style="color:var(--muted)">#${i + 1}</div>`;

      const scoreClass = i < 3 ? colors[i] : (s.is_me ? '' : '');
      const scoreStyle = s.is_me && i >= 3 ? 'color:var(--cyan);text-shadow:0 0 8px var(--cyan)' : '';
      const picks = [s.driver1?.short_name, s.driver2?.short_name].filter(Boolean).join(' · ') || 'Ingen valg';

      return `
        <div class="lb-row ${s.is_me ? 'me' : ''}">
          ${rankLabel}
          <div class="lb-info">
            <div class="lb-name ${s.is_me ? 'me' : ''}">${s.username}${s.is_me ? ' (deg)' : ''}</div>
            <div class="lb-picks">${picks}</div>
          </div>
          <div class="lb-score ${scoreClass}" style="${scoreStyle}">${s.score}</div>
        </div>`;
    }).join('') || '<div class="empty">Ingen spillere ennå</div>';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Admin ─────────────────────────────────────────────────────────────────
async function loadAdmin() {
  if (!currentUser.is_admin) return;
  try {
    const [settings, races, drivers, users] = await Promise.all([
      api('/api/admin/settings'),
      api('/api/admin/races'),
      api('/api/admin/drivers'),
      api('/api/admin/users'),
    ]);

    adminRaces = races;
    picksLocked = settings.picks_locked === '1';
    updateLockButton();

    document.getElementById('admin-race-select').innerHTML =
      '<option value="">— Velg race —</option>' +
      races.filter(r => !r.cancelled).map(r =>
        `<option value="${r.id}">${r.is_completed ? '✓' : '○'} R${r.round} ${r.name}</option>`
      ).join('');

    document.getElementById('driver-pts-form').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>#</th><th>Sjåfør</th><th>Team</th><th>VM-pts</th></tr></thead>
        <tbody>${drivers.map(d => `
          <tr>
            <td style="color:${d.team_color}">${d.number}</td>
            <td>${d.short_name}</td>
            <td style="color:${d.team_color};font-size:0.75rem">${d.team}</td>
            <td><input class="pts-input" type="number" min="0" data-driver-id="${d.id}" value="${d.championship_pts}"></td>
          </tr>`).join('')}
        </tbody>
      </table>`;

    document.getElementById('admin-users-list').innerHTML = users.map(u => `
      <div class="race-row" style="align-items:center">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:700">${u.username}</span>
            ${u.is_admin ? '<span style="color:var(--pink);font-size:0.72rem;font-family:\'VT323\',monospace;letter-spacing:0.08em">ADMIN</span>' : ''}
            ${u.username === currentUser.username ? '<span style="color:var(--muted);font-size:0.72rem">(deg)</span>' : ''}
          </div>
          <div style="font-size:0.78rem;color:var(--muted);margin-top:2px">
            ${u.driver1 && u.driver2 ? `${u.driver1} · ${u.driver2}` : 'Ingen valg ennå'} · ${u.swaps_used || 0}/10 bytter
          </div>
        </div>
        ${u.username !== currentUser.username ? `
          <button onclick="toggleUserAdmin(${u.id}, ${!u.is_admin})" style="
            border:1px solid ${u.is_admin ? 'var(--pink)' : 'var(--border)'};
            background:${u.is_admin ? 'rgba(255,0,170,0.08)' : 'transparent'};
            color:${u.is_admin ? 'var(--pink)' : 'var(--muted)'};
            padding:5px 12px;border-radius:3px;
            font-family:'VT323',monospace;font-size:0.95rem;
            cursor:pointer;white-space:nowrap;letter-spacing:0.05em;
          ">${u.is_admin ? 'Fjern admin' : 'Gjør til admin'}</button>
        ` : ''}
      </div>`).join('') || '<div class="empty">Ingen brukere ennå</div>';

  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateLockButton() {
  const btn = document.getElementById('btn-lock');
  if (picksLocked) {
    btn.textContent = '🔒 VALG LÅST — Trykk for å åpne';
    btn.classList.add('locked');
  } else {
    btn.textContent = '✓ VALG ÅPNE — Trykk for å låse';
    btn.classList.remove('locked');
  }
}

async function toggleLock() {
  try {
    const data = await api('/api/admin/lock', { method: 'POST' });
    picksLocked = data.picks_locked;
    updateLockButton();
    updateHeaderPill(picksLocked);
    showToast(picksLocked ? 'Valg låst 🔒' : 'Valg åpnet ✓', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadRaceResultsForm() {
  const raceId = document.getElementById('admin-race-select').value;
  const formEl = document.getElementById('race-results-form');
  if (!raceId) { formEl.innerHTML = ''; return; }

  const race = adminRaces.find(r => r.id == raceId);
  const drivers = await api('/api/admin/drivers');
  const year = race.date ? race.date.split('-')[0] : new Date().getFullYear();

  const isSprint = !!race.has_sprint;

  formEl.innerHTML = `
    ${race.is_completed ? '<div class="lock-banner" style="margin-bottom:12px">⚠️ Dette racet har allerede resultater. Ny innsending overskriver de gamle.</div>' : ''}
    ${isSprint ? '<div class="info-banner" style="margin-bottom:12px">⚡ Sprinthelg — fyll inn Race-poeng og Sprint-poeng separat.</div>' : ''}

    <button class="btn btn-cyan" style="margin-top:0;margin-bottom:14px" onclick="autoFetchResults(${raceId}, ${race.round}, ${year})">
      🔄 HENT FRA F1-API AUTOMATISK
    </button>

    <div id="fetch-status" style="margin-bottom:10px"></div>

    <p style="font-size:0.8rem;color:var(--muted);margin-bottom:10px">
      Race: P1=25 P2=18 P3=15 P4=12 P5=10 P6=8 P7=6 P8=4 P9=2 P10=1
      ${isSprint ? '· Sprint: P1=8 P2=7 P3=6 P4=5 P5=4 P6=3 P7=2 P8=1' : ''}
    </p>
    <table class="admin-table" style="margin-bottom:16px">
      <thead><tr>
        <th>#</th><th>Sjåfør</th>
        ${isSprint ? '<th style="color:var(--cyan)">Race</th><th style="color:var(--yellow)">Sprint</th>' : '<th>Poeng</th>'}
      </tr></thead>
      <tbody>${drivers.map(d => `
        <tr>
          <td style="color:${d.team_color}">${d.number}</td>
          <td>${d.short_name}</td>
          ${isSprint
            ? `<td><input class="pts-input" type="number" min="0" step="0.5" data-race-driver="${d.id}" value="0"></td>
               <td><input class="pts-input" type="number" min="0" step="0.5" data-sprint-driver="${d.id}" value="0"></td>`
            : `<td><input class="pts-input" type="number" min="0" step="0.5" data-result-driver="${d.id}" value="0"></td>`
          }
        </tr>`).join('')}
      </tbody>
    </table>
    <button class="btn btn-green" style="margin-top:0" onclick="submitRaceResults(${raceId})">
      SEND INN R${race.round} ${race.name.toUpperCase()}
    </button>`;
}

async function autoFetchResults(raceId, round, year) {
  const statusEl = document.getElementById('fetch-status');
  statusEl.innerHTML = `<div class="info-banner">⏳ Henter resultater fra F1-API…</div>`;

  try {
    const data = await api(`/api/admin/fetch-results?round=${round}&year=${year}`);

    // Pre-fill input fields for matched drivers
    for (const m of data.matched) {
      const raceInput   = document.querySelector(`[data-race-driver="${m.driver_id}"]`);
      const sprintInput = document.querySelector(`[data-sprint-driver="${m.driver_id}"]`);
      const singleInput = document.querySelector(`[data-result-driver="${m.driver_id}"]`);
      if (raceInput)   raceInput.value   = m.race_pts;
      if (sprintInput) sprintInput.value = m.sprint_pts;
      if (singleInput) singleInput.value = m.total_pts;
    }

    // Build status message
    const sprintNote = data.has_sprint
      ? ` <span style="color:var(--yellow)">· Sprint inkludert ✓</span>`
      : ` <span style="color:var(--muted)">· Ingen sprint</span>`;

    let unmatchedNote = '';
    if (data.unmatched.length > 0) {
      const names = data.unmatched.map(u => `#${u.number} ${u.api_name} (${u.total_pts}pts)`).join(', ');
      unmatchedNote = `<div style="margin-top:6px;font-size:0.78rem;color:var(--pink)">⚠️ Ikke matchet (legg inn manuelt): ${names}</div>`;
    }

    statusEl.innerHTML = `
      <div class="swap-banner">
        ✓ Hentet! ${data.matched.length} sjåfører matchet${sprintNote}
        ${unmatchedNote}
      </div>`;

    showToast('Resultater hentet!', 'success');
  } catch (err) {
    statusEl.innerHTML = `<div class="lock-banner">✗ ${err.message}</div>`;
    showToast(err.message, 'error');
  }
}

async function submitRaceResults(raceId) {
  const raceInputs   = document.querySelectorAll('[data-race-driver]');
  const singleInputs = document.querySelectorAll('[data-result-driver]');

  let results;
  if (raceInputs.length > 0) {
    // Sprint weekend — sum race + sprint columns
    results = Array.from(raceInputs).map(input => {
      const driverId    = parseInt(input.dataset.raceDriver);
      const sprintInput = document.querySelector(`[data-sprint-driver="${driverId}"]`);
      return {
        driver_id: driverId,
        points: (parseFloat(input.value) || 0) + (parseFloat(sprintInput?.value) || 0),
      };
    });
  } else {
    results = Array.from(singleInputs).map(input => ({
      driver_id: parseInt(input.dataset.resultDriver),
      points: parseFloat(input.value) || 0,
    }));
  }

  try {
    await api(`/api/admin/races/${raceId}/results`, { method: 'POST', body: JSON.stringify({ results }) });
    showToast('Resultater lagret! Poeng oppdatert.', 'success');
    await loadAdmin();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveDriverPts() {
  const inputs = document.querySelectorAll('[data-driver-id]');
  try {
    for (const input of inputs) {
      await api(`/api/admin/drivers/${input.dataset.driverId}`, {
        method: 'PUT',
        body: JSON.stringify({ championship_pts: parseInt(input.value) || 0 }),
      });
    }
    showToast('VM-poeng oppdatert', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleUserAdmin(userId, makeAdmin) {
  try {
    await api(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ is_admin: makeAdmin }),
    });
    showToast(makeAdmin ? 'Admin-rettigheter gitt ✓' : 'Admin-rettigheter fjernet', 'success');
    await loadAdmin();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Kalender ──────────────────────────────────────────────────────────────
async function loadCalendar() {
  try {
    const races = await api('/api/league/calendar');
    const today = new Date().toISOString().split('T')[0];
    let nextFound = false;

    document.getElementById('cal-list').innerHTML = races.map(r => {
      const isNext = !r.is_completed && !nextFound && r.date >= today;
      if (isNext) nextFound = true;

      const sprintBadge = r.has_sprint
        ? `<span style="background:rgba(255,230,0,0.12);border:1px solid var(--yellow);color:var(--yellow);font-family:'VT323',monospace;font-size:0.82rem;padding:1px 7px;border-radius:3px;text-shadow:0 0 6px var(--yellow);white-space:nowrap;letter-spacing:0.06em">SPRINT</span>`
        : '';

      const statusIcon = r.is_completed
        ? `<span style="color:var(--green);font-family:'VT323',monospace;font-size:1.2rem;text-shadow:0 0 6px var(--green)">✓</span>`
        : isNext
          ? `<span style="color:var(--cyan);font-family:'VT323',monospace;font-size:1.2rem;text-shadow:0 0 6px var(--cyan)">▶</span>`
          : `<span style="color:var(--border);font-family:'VT323',monospace;font-size:1rem">○</span>`;

      const rowStyle = r.is_completed
        ? 'opacity:0.45'
        : isNext
          ? 'border-color:var(--cyan);background:rgba(0,255,255,0.04);box-shadow:0 0 10px rgba(0,255,255,0.08)'
          : r.has_sprint
            ? 'border-color:rgba(255,230,0,0.3)'
            : '';

      return `
        <div class="race-row" style="${rowStyle}">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
              <span class="race-round">R${r.round}</span>
              <span style="font-size:0.9rem;font-weight:600">${r.name}</span>
              ${sprintBadge}
            </div>
            <div style="font-size:0.76rem;color:var(--muted);margin-top:3px">${r.circuit} · ${dateRange(r.date, r.has_sprint)}</div>
          </div>
          ${statusIcon}
        </div>`;
    }).join('') || '<div class="empty">Ingen race funnet</div>';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function updateHeaderPill(locked) {
  document.getElementById('header-pill').style.display = locked ? 'block' : 'none';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('nb-NO', { month: 'short', day: 'numeric' });
}

function dateRange(dateStr, hasSprint) {
  if (!dateStr) return '';
  const raceDay = new Date(dateStr + 'T00:00:00');
  const startDay = new Date(raceDay);
  startDay.setDate(startDay.getDate() - (hasSprint ? 3 : 2));
  if (startDay.getMonth() === raceDay.getMonth()) {
    const mon = raceDay.toLocaleDateString('nb-NO', { month: 'short' });
    return `${startDay.getDate()}–${raceDay.getDate()} ${mon}`;
  }
  return `${formatDate(startDay.toISOString().split('T')[0])} – ${formatDate(dateStr)}`;
}

// ── Boot ─────────────────────────────────────────────────────────────────
(async () => {
  if (token && currentUser) {
    try {
      // Verify token is still valid and get fresh user data from server
      const fresh = await api('/api/auth/me');
      currentUser = { username: fresh.username, is_admin: fresh.is_admin };
      localStorage.setItem('f1_user', JSON.stringify(currentUser));
      await initApp();
    } catch {
      // Token invalid or user deleted — clear and show login
      token = null; currentUser = null;
      localStorage.removeItem('f1_token');
      localStorage.removeItem('f1_user');
      document.getElementById('auth-screen').style.display = 'flex';
    }
  } else {
    document.getElementById('auth-screen').style.display = 'flex';
  }
})();
