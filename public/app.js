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
let raceDetailCache = {};
let countdownInterval = null;
let calendarRaces = [];
let expandedCalRounds = new Set();

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
function clearCountdown() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}

async function showScreen(name) {
  if (name !== 'team') clearCountdown();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');

  if (name === 'team')    await loadTeam();
  if (name === 'drivers') await loadDrivers();
  if (name === 'lb')      await loadStandings();
  if (name === 'admin')   await loadAdmin();
  if (name === 'cal')     await loadCalendar();
  if (name === 'bets')    await loadBets();
  // 'points' screen is static HTML, no load needed
}

function startCountdown(deadlineDate) {
  clearCountdown();
  function tick() {
    const el = document.getElementById('picks-countdown');
    if (!el) { clearCountdown(); return; }
    const deadline = new Date(deadlineDate); // deadlineDate is now a full ISO UTC datetime
    const diff = deadline - new Date();
    if (diff <= 0) { el.textContent = 'fristen er passert'; clearCountdown(); return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (d > 0)      el.textContent = `⏱ ${d}d ${h}t igjen`;
    else if (h > 0) el.textContent = `⏱ ${h}t ${m}m igjen`;
    else            el.textContent = `⏱ ${m}m igjen`;
  }
  tick();
  countdownInterval = setInterval(tick, 60000);
}

// ── Mitt lag ──────────────────────────────────────────────────────────────
async function loadTeam() {
  try {
    const [picks, races, settings, standingsData] = await Promise.all([
      api('/api/picks/my'),
      api('/api/league/my-races'),
      api('/api/league/settings'),
      api('/api/league/standings'),
    ]);

    picksLocked = settings.picks_locked;
    updateHeaderPill(picksLocked);

    const standings = standingsData.standings;
    const myStanding = standings.find(s => s.is_me);
    const rank = standings.findIndex(s => s.is_me) + 1;
    document.getElementById('team-pts').textContent = myStanding?.score ?? '0';
    document.getElementById('team-rank').textContent = rank > 0 ? `#${rank}` : '—';
    document.getElementById('team-swaps').textContent = `${picks.swaps_used ?? 0}/10`;

    const noPicks = !picks.driver1 && !picks.driver2;
    document.getElementById('no-picks-msg').style.display = noPicks ? 'block' : 'none';

    document.getElementById('team-drivers').innerHTML = noPicks
      ? ''
      : [picks.driver1, picks.driver2].filter(Boolean).map(driverCardHTML).join('');

    teamRacesData = races;
    renderTeamRaces();

    const nextEl = document.getElementById('team-next');
    if (settings.next_race) {
      const nr = settings.next_race;
      const pill = picksLocked
        ? '<div class="locked-pill">🔒 LÅST</div>'
        : '<div class="open-pill">✓ ÅPENT</div>';
      const deadlineLine = settings.deadline && !picksLocked
        ? `<div style="font-size:0.76rem;color:var(--muted);margin-top:4px">Frist: ${formatDeadline(settings.deadline)} · <span id="picks-countdown" style="color:var(--cyan)"></span></div>`
        : '';
      nextEl.innerHTML = `
        <div class="next-race">
          <div>
            <div class="next-round">Runde ${nr.round}</div>
            <div class="next-name">${nr.name}</div>
            <div class="next-detail">${nr.circuit} · ${dateRange(nr.date, nr.has_sprint, nr.fp1_at)}</div>
            ${deadlineLine}
          </div>
          ${pill}
        </div>`;
      if (settings.deadline && !picksLocked) startCountdown(settings.deadline);
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
        <span>${d.championship_pts} WDC pts</span>
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

    const driverSub = r.driver1_name
      ? `<div class="race-drivers-sub">${r.driver1_name.split(' ').pop()} · ${r.driver2_name.split(' ').pop()}</div>`
      : `<div class="race-drivers-sub no-picks">Ingen valg</div>`;

    const detail = raceDetailCache[r.race_id];
    let detailHTML = '';
    if (expanded) {
      detailHTML = detail
        ? renderDetailTable(detail, r)
        : '<div class="race-detail" style="text-align:center;padding:16px;color:var(--muted);font-size:0.82rem">Laster…</div>';
    }

    return `
      <div class="race-row expandable" onclick="toggleRaceDetail(${r.race_id})">
        <div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span class="race-round">R${r.round}</span>
            <span class="race-name">${r.race_name}</span>
            ${r.has_sprint ? `<span style="background:rgba(255,230,0,0.12);border:1px solid var(--yellow);color:var(--yellow);font-family:'VT323',monospace;font-size:0.82rem;padding:1px 7px;border-radius:3px;text-shadow:0 0 6px var(--yellow);letter-spacing:0.06em">SPRINT</span>` : ''}
          </div>
          ${driverSub}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <div class="race-pts">${r.score > 0 ? '+' : ''}${r.score} pts</div>
          <span style="color:var(--muted);font-size:0.7rem;line-height:1">${expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      ${detailHTML}`;
  }).join('');
}

function renderDetailTable(drivers, raceRow) {
  const sorted = [...drivers].sort((a, b) => {
    const av = a[raceDetailSort.col], bv = b[raceDetailSort.col];
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return raceDetailSort.dir === 'asc' ? cmp : -cmp;
  });

  const arrow = col => raceDetailSort.col === col ? (raceDetailSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const isMine = id => id === raceRow.driver1_id || id === raceRow.driver2_id;

  return `
    <div class="race-detail" onclick="event.stopPropagation()">
      <table class="detail-table">
        <thead><tr>
          <th onclick="sortRaceDetail('short_name')">Racer${arrow('short_name')}</th>
          <th onclick="sortRaceDetail('race_pts')" style="color:var(--yellow)">Race pts${arrow('race_pts')}</th>
          <th onclick="sortRaceDetail('hc')" style="color:var(--purple)">HCx${arrow('hc')}</th>
          <th onclick="sortRaceDetail('hc_pts')" style="color:var(--cyan)">HC pts${arrow('hc_pts')}</th>
        </tr></thead>
        <tbody>
          ${sorted.map(d => {
            const mine = isMine(d.id);
            return `
              <tr${mine ? ' class="my-driver-row"' : ''}>
                <td><span style="color:${mine ? d.team_color : 'var(--muted)'};${mine ? 'font-weight:700' : ''}">${d.short_name}</span></td>
                <td style="color:var(--yellow)">${Math.round(d.race_pts)}</td>
                <td style="color:var(--purple)">${parseFloat(d.hc).toFixed(1)}</td>
                <td style="color:var(--cyan)${mine ? ';font-family:\'VT323\',monospace;font-size:1rem' : ''}">${parseFloat(d.hc_pts).toFixed(1)}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function toggleRaceDetail(raceId) {
  if (expandedRaceIds.has(raceId)) {
    expandedRaceIds.delete(raceId);
    renderTeamRaces();
    return;
  }
  expandedRaceIds.add(raceId);
  renderTeamRaces(); // show loading spinner
  try {
    if (!raceDetailCache[raceId]) {
      raceDetailCache[raceId] = await api(`/api/league/races/${raceId}/detail`);
    }
    renderTeamRaces();
  } catch (err) {
    showToast(err.message, 'error');
    expandedRaceIds.delete(raceId);
    renderTeamRaces();
  }
}

function sortRaceDetail(col) {
  if (raceDetailSort.col === col) {
    raceDetailSort.dir = raceDetailSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    raceDetailSort.col = col;
    raceDetailSort.dir = col === 'short_name' ? 'asc' : 'desc';
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
    const swapsUsed = picks.swaps_used || 0;
    const swapsLeft = 10 - swapsUsed;
    const swapsLeftEl = document.getElementById('drivers-swaps-left');
    swapsLeftEl.textContent = swapsLeft;
    swapsLeftEl.style.color = swapsLeft <= 2 ? 'var(--pink)' : swapsLeft <= 5 ? 'var(--yellow)' : 'var(--green)';
    swapsLeftEl.style.textShadow = swapsLeft <= 2 ? '0 0 6px var(--pink)' : swapsLeft <= 5 ? '0 0 6px var(--yellow)' : '0 0 6px var(--green)';
    document.getElementById('drivers-swaps-label').textContent = `av 10 bytter igjen`;

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
          <span>${d.championship_pts} WDC pts</span>
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

function savePicks() {
  if (selectedDriverIds.length !== 2) return;

  // Calculate which drivers are actually changing
  const currentIds = [];
  if (currentPicks.driver1) currentIds.push(currentPicks.driver1.id);
  if (currentPicks.driver2) currentIds.push(currentPicks.driver2.id);

  const removedIds = currentIds.filter(id => !selectedDriverIds.includes(id));
  const addedIds = selectedDriverIds.filter(id => !currentIds.includes(id));
  const changesCount = addedIds.length;

  if (changesCount === 0) {
    showToast('Ingen endringer å lagre', 'error');
    return;
  }

  // Build swap rows summary
  const removedDrivers = removedIds.map(id => allDrivers.find(d => d.id === id));
  const addedDrivers = addedIds.map(id => allDrivers.find(d => d.id === id));

  document.getElementById('confirm-summary').innerHTML = removedDrivers.map((d, i) => `
    <div class="confirm-swap-row">
      <span class="confirm-driver-out">#${d.number} ${d.short_name}</span>
      <span class="confirm-arrow">→</span>
      <span class="confirm-driver-in">${addedDrivers[i].short_name} #${addedDrivers[i].number}</span>
    </div>
  `).join('');

  const swapsLeft = 10 - (currentPicks.swaps_used || 0);
  const swapsAfter = swapsLeft - changesCount;
  document.getElementById('confirm-cost-text').innerHTML =
    `Dette bruker <strong>${changesCount} bytte${changesCount > 1 ? 'r' : ''}</strong>. ` +
    `Du vil ha <strong>${swapsAfter} av 10</strong> bytter igjen.`;

  document.getElementById('confirm-modal').style.display = 'flex';
}

async function confirmSavePicks() {
  document.getElementById('confirm-modal').style.display = 'none';
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
    const data = await api('/api/league/standings');
    const { standings, last_round, is_live } = data;

    document.getElementById('lb-sub').textContent = last_round
      ? `${standings.length} spillere · ${is_live ? `R${last_round} pågår` : `Førervalg runde ${last_round}`}`
      : `${standings.length} spillere`;

    const medals = ['🥇', '🥈', '🥉'];
    const colors = ['gold', 'silver', 'bronze'];

    document.getElementById('lb-list').innerHTML = standings.map((s, i) => {
      const rankLabel = i < 3
        ? `<div class="lb-rank ${colors[i]}">${medals[i]}</div>`
        : `<div class="lb-rank" style="color:var(--muted)">#${i + 1}</div>`;

      const scoreStyle = s.is_me && i >= 3 ? 'color:var(--cyan);text-shadow:0 0 8px var(--cyan)' : '';
      const driverNames = [s.driver1?.short_name, s.driver2?.short_name].filter(Boolean).join(' · ');
      const roundLabel = is_live
        ? `<span style="color:var(--cyan);font-size:0.72rem">(R${last_round} · pågår)</span>`
        : `<span style="color:var(--muted);font-size:0.72rem">(Runde ${last_round})</span>`;
      const picks = driverNames ? `${driverNames} ${roundLabel}` : 'Ingen valg';

      return `
        <div class="lb-row ${s.is_me ? 'me' : ''}">
          ${rankLabel}
          <div class="lb-info">
            <div class="lb-name ${s.is_me ? 'me' : ''}">${s.username}${s.is_me ? ' (deg)' : ''}</div>
            <div class="lb-picks">${picks}</div>
          </div>
          <div class="lb-score ${i < 3 ? colors[i] : ''}" style="${scoreStyle}">${s.score}</div>
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
      <div class="race-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-weight:700">${u.username}</span>
          ${u.is_admin ? '<span style="color:var(--pink);font-size:0.72rem;font-family:\'VT323\',monospace;letter-spacing:0.08em">ADMIN</span>' : ''}
          ${u.username === currentUser.username ? '<span style="color:var(--muted);font-size:0.72rem">(deg)</span>' : ''}
        </div>
        <div style="font-size:0.78rem;color:var(--muted)">
          ${u.driver1 && u.driver2 ? `${u.driver1} · ${u.driver2}` : 'Ingen valg ennå'} · ${u.swaps_used || 0}/10 bytter
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button onclick="resetUserPassword(${u.id}, '${u.username}')" style="
            flex:1;border:1px solid var(--border);background:transparent;
            color:var(--muted);padding:5px 8px;border-radius:3px;
            font-family:'VT323',monospace;font-size:0.95rem;
            cursor:pointer;letter-spacing:0.05em;
          ">Nytt passord</button>
          ${u.username !== currentUser.username ? `
            <button onclick="toggleUserAdmin(${u.id}, ${!u.is_admin})" style="
              flex:1;border:1px solid ${u.is_admin ? 'var(--pink)' : 'var(--border)'};
              background:${u.is_admin ? 'rgba(255,0,170,0.08)' : 'transparent'};
              color:${u.is_admin ? 'var(--pink)' : 'var(--muted)'};
              padding:5px 8px;border-radius:3px;
              font-family:'VT323',monospace;font-size:0.95rem;
              cursor:pointer;letter-spacing:0.05em;
            ">${u.is_admin ? 'Fjern admin' : 'Gjør til admin'}</button>
            <button onclick="deleteUser(${u.id}, '${u.username}')" style="
              flex:1;border:1px solid var(--pink);background:rgba(255,0,170,0.08);
              color:var(--pink);padding:5px 8px;border-radius:3px;
              font-family:'VT323',monospace;font-size:0.95rem;
              cursor:pointer;letter-spacing:0.05em;
            ">Slett</button>
          ` : ''}
        </div>
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
        ${isSprint ? '<th style="color:var(--cyan)">Race</th><th style="color:var(--yellow)">Sprint</th>' : '<th>Pts</th>'}
        <th style="color:var(--muted)">Pos</th><th style="color:var(--muted)">DNF</th>
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
          <td><input type="number" min="1" max="20" placeholder="—" data-pos-driver="${d.id}" style="width:44px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:3px 5px;border-radius:3px;font-size:0.82rem"></td>
          <td style="text-align:center"><input type="checkbox" data-dnf-driver="${d.id}"></td>
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

    // Pre-fill points
    for (const m of data.matched) {
      const raceInput   = document.querySelector(`[data-race-driver="${m.driver_id}"]`);
      const sprintInput = document.querySelector(`[data-sprint-driver="${m.driver_id}"]`);
      const singleInput = document.querySelector(`[data-result-driver="${m.driver_id}"]`);
      if (raceInput)   raceInput.value   = m.race_pts;
      if (sprintInput) sprintInput.value = m.sprint_pts;
      if (singleInput) singleInput.value = m.total_pts;
    }
    // Pre-fill position and DNF for all drivers
    for (const p of (data.positions || [])) {
      const posInput = document.querySelector(`[data-pos-driver="${p.driver_id}"]`);
      const dnfInput = document.querySelector(`[data-dnf-driver="${p.driver_id}"]`);
      if (posInput) posInput.value = p.position ?? '';
      if (dnfInput) dnfInput.checked = !!p.dnf;
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
    results = Array.from(raceInputs).map(input => {
      const driverId    = parseInt(input.dataset.raceDriver);
      const sprintInput = document.querySelector(`[data-sprint-driver="${driverId}"]`);
      const posInput    = document.querySelector(`[data-pos-driver="${driverId}"]`);
      const dnfInput    = document.querySelector(`[data-dnf-driver="${driverId}"]`);
      return {
        driver_id: driverId,
        points:   (parseFloat(input.value) || 0) + (parseFloat(sprintInput?.value) || 0),
        position: posInput?.value ? parseInt(posInput.value) : null,
        dnf:      dnfInput?.checked || false,
      };
    });
  } else {
    results = Array.from(singleInputs).map(input => {
      const driverId = parseInt(input.dataset.resultDriver);
      const posInput = document.querySelector(`[data-pos-driver="${driverId}"]`);
      const dnfInput = document.querySelector(`[data-dnf-driver="${driverId}"]`);
      return {
        driver_id: driverId,
        points:   parseFloat(input.value) || 0,
        position: posInput?.value ? parseInt(posInput.value) : null,
        dnf:      dnfInput?.checked || false,
      };
    });
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

async function resetUserPassword(userId, username) {
  const password = prompt(`Nytt passord for ${username}:`);
  if (!password) return;
  if (password.length < 4) { showToast('Passord må være minst 4 tegn', 'error'); return; }
  try {
    await api(`/api/admin/users/${userId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
    showToast(`Passord for ${username} oppdatert ✓`, 'success');
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

async function deleteUser(userId, username) {
  if (!confirm(`Slett brukeren «${username}»? Dette kan ikke angres.`)) return;
  try {
    await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
    showToast(`${username} er slettet`, 'success');
    await loadAdmin();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Kalender ──────────────────────────────────────────────────────────────
const RACE_SESSIONS = {
  1:  { fp1:'2026-03-06T00:30:00Z', fp2:'2026-03-06T04:00:00Z', fp3:'2026-03-07T00:30:00Z', quali:'2026-03-07T04:00:00Z', race:'2026-03-08T03:00:00Z' },
  2:  { fp1:'2026-03-13T02:30:00Z', sprint_quali:'2026-03-13T06:30:00Z', sprint:'2026-03-14T02:30:00Z', quali:'2026-03-14T06:30:00Z', race:'2026-03-15T06:00:00Z' },
  3:  { fp1:'2026-03-27T01:30:00Z', fp2:'2026-03-27T05:00:00Z', fp3:'2026-03-28T01:30:00Z', quali:'2026-03-28T05:00:00Z', race:'2026-03-29T05:00:00Z' },
  4:  { fp1:'2026-05-01T16:30:00Z', sprint_quali:'2026-05-01T20:30:00Z', sprint:'2026-05-02T16:30:00Z', quali:'2026-05-02T20:30:00Z', race:'2026-05-03T20:00:00Z' },
  5:  { fp1:'2026-05-22T16:30:00Z', sprint_quali:'2026-05-22T20:30:00Z', sprint:'2026-05-23T16:30:00Z', quali:'2026-05-23T20:30:00Z', race:'2026-05-24T20:00:00Z' },
  6:  { fp1:'2026-06-05T11:30:00Z', fp2:'2026-06-05T15:00:00Z', fp3:'2026-06-06T10:30:00Z', quali:'2026-06-06T14:00:00Z', race:'2026-06-07T13:00:00Z' },
  7:  { fp1:'2026-06-12T11:30:00Z', fp2:'2026-06-12T15:00:00Z', fp3:'2026-06-13T10:30:00Z', quali:'2026-06-13T14:00:00Z', race:'2026-06-14T13:00:00Z' },
  8:  { fp1:'2026-06-26T11:30:00Z', fp2:'2026-06-26T15:00:00Z', fp3:'2026-06-27T10:30:00Z', quali:'2026-06-27T14:00:00Z', race:'2026-06-28T13:00:00Z' },
  9:  { fp1:'2026-07-03T10:30:00Z', sprint_quali:'2026-07-03T14:30:00Z', sprint:'2026-07-04T10:30:00Z', quali:'2026-07-04T14:30:00Z', race:'2026-07-05T14:00:00Z' },
  10: { fp1:'2026-07-17T11:30:00Z', fp2:'2026-07-17T15:00:00Z', fp3:'2026-07-18T10:30:00Z', quali:'2026-07-18T14:00:00Z', race:'2026-07-19T13:00:00Z' },
  11: { fp1:'2026-07-24T11:30:00Z', fp2:'2026-07-24T15:00:00Z', fp3:'2026-07-25T10:30:00Z', quali:'2026-07-25T14:00:00Z', race:'2026-07-26T13:00:00Z' },
  12: { fp1:'2026-08-21T10:30:00Z', sprint_quali:'2026-08-21T14:30:00Z', sprint:'2026-08-22T10:30:00Z', quali:'2026-08-22T14:30:00Z', race:'2026-08-23T13:00:00Z' },
  13: { fp1:'2026-09-04T11:30:00Z', fp2:'2026-09-04T15:00:00Z', fp3:'2026-09-05T10:30:00Z', quali:'2026-09-05T14:00:00Z', race:'2026-09-06T13:00:00Z' },
  14: { fp1:'2026-09-11T11:30:00Z', fp2:'2026-09-11T15:00:00Z', fp3:'2026-09-12T10:30:00Z', quali:'2026-09-12T14:00:00Z', race:'2026-09-13T13:00:00Z' },
  15: { fp1:'2026-09-25T09:30:00Z', fp2:'2026-09-25T13:00:00Z', fp3:'2026-09-26T08:30:00Z', quali:'2026-09-26T12:00:00Z', race:'2026-09-27T12:00:00Z' },
  16: { fp1:'2026-10-09T09:30:00Z', sprint_quali:'2026-10-09T13:30:00Z', sprint:'2026-10-10T09:30:00Z', quali:'2026-10-10T13:30:00Z', race:'2026-10-11T12:00:00Z' },
  17: { fp1:'2026-10-23T16:30:00Z', fp2:'2026-10-23T20:00:00Z', fp3:'2026-10-24T17:30:00Z', quali:'2026-10-24T21:00:00Z', race:'2026-10-25T18:00:00Z' },
  18: { fp1:'2026-10-30T16:30:00Z', fp2:'2026-10-30T20:00:00Z', fp3:'2026-10-31T16:30:00Z', quali:'2026-10-31T20:00:00Z', race:'2026-11-01T19:00:00Z' },
  19: { fp1:'2026-11-06T13:30:00Z', sprint_quali:'2026-11-06T17:30:00Z', sprint:'2026-11-07T13:30:00Z', quali:'2026-11-07T17:30:00Z', race:'2026-11-08T16:00:00Z' },
  20: { fp1:'2026-11-20T01:30:00Z', fp2:'2026-11-20T05:00:00Z', fp3:'2026-11-21T01:30:00Z', quali:'2026-11-21T05:00:00Z', race:'2026-11-22T05:00:00Z' },
  21: { fp1:'2026-11-27T12:30:00Z', sprint_quali:'2026-11-27T16:30:00Z', sprint:'2026-11-28T12:30:00Z', quali:'2026-11-28T16:30:00Z', race:'2026-11-29T16:00:00Z' },
  22: { fp1:'2026-12-04T08:30:00Z', fp2:'2026-12-04T12:00:00Z', fp3:'2026-12-05T09:30:00Z', quali:'2026-12-05T13:00:00Z', race:'2026-12-06T12:00:00Z' },
};

const SESSION_LABELS = {
  fp1: 'FP1', fp2: 'FP2', fp3: 'FP3',
  sprint_quali: 'Sprint K.', sprint: 'Sprint',
  quali: 'Kval', race: 'Race',
};

function formatSessionTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const days = ['Søn','Man','Tir','Ons','Tor','Fre','Lør'];
  const day = days[d.getDay()];
  const time = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

function toggleCalRace(round) {
  if (expandedCalRounds.has(round)) {
    expandedCalRounds.delete(round);
  } else {
    expandedCalRounds.add(round);
  }
  renderCalendar();
}

function renderCalendar() {
  const today = new Date().toISOString().split('T')[0];
  let nextFound = false;

  document.getElementById('cal-list').innerHTML = calendarRaces.map(r => {
    const isNext = !r.is_completed && !nextFound && r.date >= today;
    if (isNext) nextFound = true;
    const isExpanded = expandedCalRounds.has(r.round);

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

    const chevron = `<span style="font-size:0.8rem;color:var(--muted);margin-left:4px;transition:transform 0.2s;display:inline-block;transform:rotate(${isExpanded ? '180' : '0'}deg)">▼</span>`;

    const sessions = RACE_SESSIONS[r.round] || {};
    const sessionOrder = r.has_sprint
      ? ['fp1','sprint_quali','sprint','quali','race']
      : ['fp1','fp2','fp3','quali','race'];

    const sessionRows = sessionOrder.map(key => {
      const iso = sessions[key];
      if (!iso) return '';
      const isRace = key === 'race';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
        <span style="font-size:0.75rem;color:${isRace ? 'var(--cyan)' : 'var(--muted)'};font-family:'VT323',monospace;letter-spacing:0.05em;min-width:70px">${SESSION_LABELS[key]}</span>
        <span style="font-size:0.78rem;color:${isRace ? 'var(--fg)' : 'var(--muted)'};font-weight:${isRace ? '600' : '400'}">${formatSessionTime(iso)}</span>
      </div>`;
    }).join('');

    const expandedPanel = isExpanded ? `
      <div style="padding:8px 10px 6px;border-top:1px solid var(--border);background:rgba(0,0,0,0.2)">
        ${sessionRows}
      </div>` : '';

    return `
      <div class="race-row" style="${rowStyle};flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0;padding:0;overflow:hidden;cursor:pointer" onclick="toggleCalRace(${r.round})">
        <div style="display:flex;align-items:center;gap:8px;padding:10px 12px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
              <span class="race-round">R${r.round}</span>
              <span style="font-size:0.9rem;font-weight:600">${r.name}</span>
              ${sprintBadge}
              ${chevron}
            </div>
            <div style="font-size:0.76rem;color:var(--muted);margin-top:3px">${r.circuit} · ${dateRange(r.date, r.has_sprint, r.fp1_at)}</div>
          </div>
          ${statusIcon}
        </div>
        ${expandedPanel}
      </div>`;
  }).join('') || '<div class="empty">Ingen race funnet</div>';
}

async function loadCalendar() {
  try {
    calendarRaces = await api('/api/league/calendar');
    renderCalendar();
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

function formatDeadline(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const date = d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function dateRange(dateStr, hasSprint, fp1At) {
  if (!dateStr) return '';
  const raceDay = new Date(dateStr + 'T00:00:00Z');
  let fp1Day;
  if (fp1At) {
    fp1Day = new Date(fp1At);
  } else {
    fp1Day = new Date(raceDay);
    fp1Day.setUTCDate(fp1Day.getUTCDate() - (hasSprint ? 3 : 2));
  }
  if (fp1Day.getUTCMonth() === raceDay.getUTCMonth()) {
    const mon = raceDay.toLocaleDateString('nb-NO', { month: 'short', timeZone: 'UTC' });
    return `${fp1Day.getUTCDate()}–${raceDay.getUTCDate()} ${mon}`;
  }
  return `${formatDate(fp1Day.toISOString().split('T')[0])} – ${formatDate(dateStr)}`;
}

// ── Bets ──────────────────────────────────────────────────────────────────
let betsData = null;

async function loadBets() {
  try {
    betsData = await api('/api/bets');
    const { balance, next_race, pool, my_bets, drivers } = betsData;

    // Balance bar
    const netColor = balance.net_bet >= 0 ? 'var(--green)' : 'var(--pink)';
    const netSign  = balance.net_bet >= 0 ? '+' : '';
    document.getElementById('bets-balance').innerHTML = `
      <div style="flex:1;min-width:90px;text-align:center;padding:4px 0">
        <div style="font-size:0.72rem;color:var(--muted);letter-spacing:0.05em">HC-POENG</div>
        <div style="font-family:'VT323',monospace;font-size:1.5rem;color:var(--cyan);text-shadow:0 0 8px var(--cyan)">${balance.total_hc}</div>
      </div>
      <div style="width:1px;background:var(--border);margin:4px 0"></div>
      <div style="flex:1;min-width:90px;text-align:center;padding:4px 0">
        <div style="font-size:0.72rem;color:var(--muted);letter-spacing:0.05em">BET-BALANSE</div>
        <div style="font-family:'VT323',monospace;font-size:1.5rem;color:${netColor};text-shadow:0 0 8px ${netColor}">${netSign}${balance.net_bet}</div>
      </div>
      <div style="width:1px;background:var(--border);margin:4px 0"></div>
      <div style="flex:1;min-width:90px;text-align:center;padding:4px 0">
        <div style="font-size:0.72rem;color:var(--muted);letter-spacing:0.05em">TILGJENGELIG</div>
        <div style="font-family:'VT323',monospace;font-size:1.5rem;color:var(--yellow);text-shadow:0 0 8px var(--yellow)">${balance.available}</div>
      </div>`;

    // Populate driver dropdowns
    const opts = drivers.map(d => `<option value="${d.id}">${d.short_name}</option>`).join('');
    document.getElementById('bet-driver-above').innerHTML = '<option value="">Sjåfør A</option>' + opts;
    document.getElementById('bet-driver-below').innerHTML = '<option value="">Sjåfør B</option>' + opts;

    // Lock banner
    const settingsData = await api('/api/league/settings');
    const isLocked = settingsData.picks_locked;
    const lockBanner = isLocked
      ? `<div style="background:rgba(255,0,170,0.08);border:1px solid var(--pink);border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:0.85rem;color:var(--pink);font-family:'VT323',monospace;letter-spacing:0.06em">
           🔒 BETS LÅST — race-helg pågår. Åpner igjen etter race.
         </div>`
      : '';
    document.getElementById('bets-balance').insertAdjacentHTML('afterend', lockBanner);

    // Hide/show create form
    document.querySelector('#s-bets .section-label').style.opacity = isLocked ? '0.4' : '1';
    document.querySelector('#s-bets [onclick="submitBet()"]').disabled = isLocked;

    // Pool
    if (isLocked) {
      document.getElementById('bets-pool').innerHTML = '<div class="empty">Låst under race-helgen</div>';
    } else if (!next_race) {
      document.getElementById('bets-pool').innerHTML = '<div class="empty">Ingen kommende race</div>';
    } else if (pool.length === 0) {
      document.getElementById('bets-pool').innerHTML = `<div class="empty">Ingen åpne bets for R${next_race.round}</div>`;
    } else {
      document.getElementById('bets-pool').innerHTML = pool.map(b => betRowHTML(b, 'pool')).join('');
    }

    // Mine
    document.getElementById('bets-mine').innerHTML = my_bets.length
      ? my_bets.map(b => betRowHTML(b, 'mine')).join('')
      : '<div class="empty">Ingen bets ennå</div>';

  } catch (err) {
    showToast(err.message, 'error');
  }
}

function betRowHTML(b, mode) {
  const aboveColor = b.driver_above?.team_color || 'var(--text)';
  const belowColor = b.driver_below?.team_color || 'var(--text)';

  let statusBadge = '';
  if (b.status === 'open')      statusBadge = `<span style="color:var(--cyan);font-family:'VT323',monospace;font-size:0.95rem">ÅPEN</span>`;
  else if (b.status === 'accepted')  statusBadge = `<span style="color:var(--yellow);font-family:'VT323',monospace;font-size:0.95rem">AKSEPTERT</span>`;
  else if (b.status === 'void')      statusBadge = `<span style="color:var(--muted);font-family:'VT323',monospace;font-size:0.95rem">VOID</span>`;
  else if (b.status === 'cancelled') statusBadge = `<span style="color:var(--muted);font-family:'VT323',monospace;font-size:0.95rem">AVBRUTT</span>`;
  else if (b.status === 'settled') {
    const iWon = b.winner_id && ((b.is_mine && b.winner_id === b.creator_id) || (b.i_accepted && b.winner_id === b.acceptor_id));
    statusBadge = `<span style="color:${iWon ? 'var(--green)' : 'var(--pink)'};font-family:'VT323',monospace;font-size:0.95rem">${iWon ? '✓ VUNNET' : '✗ TAPT'}</span>`;
  }

  const roundLabel = b.race_round ? `<span style="color:var(--pink);font-family:'VT323',monospace;font-size:0.9rem">R${b.race_round}</span> · ` : '';
  const challenger = mode === 'pool' ? `<span style="color:var(--muted);font-size:0.78rem">${b.creator_name} utfordrer</span>` : '';

  let actionBtn = '';
  if (mode === 'pool') {
    actionBtn = `<button onclick="acceptBet(${b.id})" style="
      border:1px solid var(--cyan);background:rgba(0,255,255,0.08);color:var(--cyan);
      padding:5px 12px;border-radius:3px;font-family:'VT323',monospace;font-size:0.95rem;
      cursor:pointer;white-space:nowrap;letter-spacing:0.06em;flex-shrink:0;
    ">AKSEPTER</button>`;
  } else if (mode === 'mine' && ['open', 'accepted'].includes(b.status) && (b.is_mine || b.i_accepted)) {
    actionBtn = `<button onclick="cancelBet(${b.id})" style="
      border:1px solid var(--border);background:transparent;color:var(--muted);
      padding:5px 10px;border-radius:3px;font-family:'VT323',monospace;font-size:0.9rem;
      cursor:pointer;white-space:nowrap;
    ">AVBRYT</button>`;
  }

  const wonLost = (b.status === 'settled' && b.winner_id !== null)
    ? (b.is_mine ? (b.winner_id === b.creator_id) : (b.winner_id === b.acceptor_id))
      ? `<span style="color:var(--green);font-family:'VT323',monospace;font-size:1rem">+${b.points}</span>`
      : `<span style="color:var(--pink);font-family:'VT323',monospace;font-size:1rem">-${b.points}</span>`
    : `<span style="font-family:'VT323',monospace;font-size:1rem;color:var(--yellow)">${b.points} pts</span>`;

  return `
    <div class="race-row" style="align-items:flex-start;gap:10px">
      <div style="flex:1;min-width:0">
        ${challenger ? `<div style="margin-bottom:3px">${challenger}</div>` : ''}
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          ${roundLabel}
          <span style="color:${aboveColor};font-weight:700">${b.driver_above?.short_name || '?'}</span>
          <span style="color:var(--muted);font-size:0.82rem">slår</span>
          <span style="color:${belowColor};font-weight:700">${b.driver_below?.short_name || '?'}</span>
        </div>
        <div style="margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${wonLost}
          ${statusBadge}
          ${b.acceptor_name && b.status !== 'open' ? `<span style="color:var(--muted);font-size:0.78rem">vs ${b.acceptor_name}</span>` : ''}
        </div>
      </div>
      ${actionBtn}
    </div>`;
}

async function submitBet() {
  const driver_above_id = parseInt(document.getElementById('bet-driver-above').value);
  const driver_below_id = parseInt(document.getElementById('bet-driver-below').value);
  const points = parseFloat(document.getElementById('bet-points').value);

  if (!driver_above_id || !driver_below_id) { showToast('Velg to sjåfører', 'error'); return; }
  if (driver_above_id === driver_below_id)   { showToast('Velg to forskjellige sjåfører', 'error'); return; }
  if (!points || points <= 0)                { showToast('Skriv inn poeng å satse', 'error'); return; }
  if (!betsData?.next_race)                  { showToast('Ingen kommende race å bette på', 'error'); return; }

  try {
    await api('/api/bets', {
      method: 'POST',
      body: JSON.stringify({ race_id: betsData.next_race.id, driver_above_id, driver_below_id, points }),
    });
    document.getElementById('bet-points').value = '';
    document.getElementById('bet-driver-above').value = '';
    document.getElementById('bet-driver-below').value = '';
    showToast('Bet lagt! Venter på utfordrer…', 'success');
    await loadBets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function acceptBet(betId) {
  try {
    await api(`/api/bets/${betId}/accept`, { method: 'PUT' });
    showToast('Bet akseptert! Måtte det beste laget vinne 🏎', 'success');
    await loadBets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function cancelBet(betId) {
  try {
    await api(`/api/bets/${betId}`, { method: 'DELETE' });
    showToast('Bet avbrutt', 'success');
    await loadBets();
  } catch (err) {
    showToast(err.message, 'error');
  }
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
