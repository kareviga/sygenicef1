const router = require('express').Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { computeRaceScores, clearRaceScores } = require('../services/scoringService');

// POST /api/admin/lock
router.post('/lock', requireAdmin, (req, res) => {
  const newVal = db.getSetting('picks_locked') === '1' ? '0' : '1';
  db.setSetting('picks_locked', newVal);
  res.json({ picks_locked: newVal === '1' });
});

// GET /api/admin/races
router.get('/races', requireAdmin, (req, res) => {
  res.json(db.all('races').sort((a, b) => a.round - b.round));
});

// POST /api/admin/races
router.post('/races', requireAdmin, (req, res) => {
  const { round, name, circuit, date } = req.body;
  if (!round || !name || !circuit || !date) return res.status(400).json({ error: 'All fields required' });
  const race = db.insert('races', { round: parseInt(round), name, circuit, date, is_completed: false });
  res.json({ id: race.id });
});

// POST /api/admin/races/:id/results
router.post('/races/:id/results', requireAdmin, (req, res) => {
  const raceId = parseInt(req.params.id);
  const { results } = req.body;
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: 'results array required' });
  }

  clearRaceScores(raceId);

  for (const r of results) {
    if (r.points > 0) {
      db.upsertBy(
        'race_results',
        x => x.race_id === raceId && x.driver_id === r.driver_id,
        { race_id: raceId, driver_id: r.driver_id, points: r.points }
      );
    }
  }

  try {
    computeRaceScores(raceId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/admin/races/:id/results
router.delete('/races/:id/results', requireAdmin, (req, res) => {
  clearRaceScores(parseInt(req.params.id));
  res.json({ success: true });
});

// GET /api/admin/drivers
router.get('/drivers', requireAdmin, (req, res) => {
  res.json(db.all('drivers').sort((a, b) => b.championship_pts - a.championship_pts));
});

// PUT /api/admin/drivers/:id
router.put('/drivers/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { championship_pts, team, team_color } = req.body;
  const updates = {};
  if (championship_pts !== undefined) updates.championship_pts = parseInt(championship_pts);
  if (team) updates.team = team;
  if (team_color) updates.team_color = team_color;
  db.update('drivers', d => d.id === id, updates);
  res.json({ success: true });
});

// GET /api/admin/users
router.get('/users', requireAdmin, (req, res) => {
  const users = db.all('users').map(u => {
    const picks = db.findOne('user_picks', r => r.user_id === u.id);
    const d1 = picks?.driver1_id ? db.findOne('drivers', d => d.id === picks.driver1_id)?.name : null;
    const d2 = picks?.driver2_id ? db.findOne('drivers', d => d.id === picks.driver2_id)?.name : null;
    const userPicks = db.findOne('user_picks', r => r.user_id === u.id);
    const { password_hash, ...safe } = u;
    return { ...safe, driver1: d1, driver2: d2, swaps_used: userPicks?.swaps_used || 0 };
  });
  res.json(users);
});

// GET /api/admin/fetch-results?round=X&year=Y
// Fetches race + sprint results from the Jolpica/Ergast F1 API
router.get('/fetch-results', requireAdmin, async (req, res) => {
  const { round, year } = req.query;
  if (!round || !year) return res.status(400).json({ error: 'round og year påkrevd' });

  const base = `https://api.jolpi.ca/ergast/f1/${year}/${round}`;

  try {
    const [raceRes, sprintRes] = await Promise.allSettled([
      fetch(`${base}/results.json`).then(r => r.json()),
      fetch(`${base}/sprint.json`).then(r => r.json()),
    ]);

    const raceOk   = raceRes.status === 'fulfilled';
    const sprintOk = sprintRes.status === 'fulfilled';

    const raceResults   = raceOk   ? (raceRes.value?.MRData?.RaceTable?.Races?.[0]?.Results        || []) : [];
    const sprintResults = sprintOk ? (sprintRes.value?.MRData?.RaceTable?.Races?.[0]?.SprintResults || []) : [];

    if (raceResults.length === 0) {
      return res.status(404).json({ error: `Ingen resultater funnet for runde ${round} (${year}). Race er kanskje ikke avholdt ennå, eller API er ikke oppdatert.` });
    }

    // Build map: car number → { race_pts, sprint_pts, api_name }
    const ptsMap = {};
    for (const r of raceResults) {
      const num = parseInt(r.number);
      ptsMap[num] = { api_name: `${r.Driver.givenName} ${r.Driver.familyName}`, race_pts: parseFloat(r.points) || 0, sprint_pts: 0 };
    }
    for (const r of sprintResults) {
      const num = parseInt(r.number);
      if (ptsMap[num]) ptsMap[num].sprint_pts = parseFloat(r.points) || 0;
      else ptsMap[num] = { api_name: `${r.Driver.givenName} ${r.Driver.familyName}`, race_pts: 0, sprint_pts: parseFloat(r.points) || 0 };
    }

    // Match to our DB drivers by car number
    const drivers = db.all('drivers');
    const matched   = [];
    const unmatched = [];

    for (const [numStr, data] of Object.entries(ptsMap)) {
      const num    = parseInt(numStr);
      const driver = drivers.find(d => d.number === num);
      const total  = data.race_pts + data.sprint_pts;

      if (driver) {
        matched.push({
          driver_id:    driver.id,
          driver_number: driver.number,
          driver_name:  driver.name,
          race_pts:     data.race_pts,
          sprint_pts:   data.sprint_pts,
          total_pts:    total,
        });
      } else if (total > 0) {
        unmatched.push({ number: num, api_name: data.api_name, total_pts: total });
      }
    }

    matched.sort((a, b) => b.total_pts - a.total_pts);

    res.json({
      matched,
      unmatched,
      has_sprint: sprintResults.length > 0,
      race_name: raceRes.value?.MRData?.RaceTable?.Races?.[0]?.raceName || '',
    });
  } catch (err) {
    res.status(500).json({ error: 'Nettverksfeil: ' + err.message });
  }
});

// GET /api/admin/settings
router.get('/settings', requireAdmin, (req, res) => {
  res.json(db.allSettings());
});

// PUT /api/admin/settings/:key
router.put('/settings/:key', requireAdmin, (req, res) => {
  db.setSetting(req.params.key, req.body.value);
  res.json({ success: true });
});

// PUT /api/admin/users/:id/role
router.put('/users/:id/role', requireAdmin, (req, res) => {
  const targetId = parseInt(req.params.id);
  const makeAdmin = !!req.body.is_admin;

  if (!makeAdmin) {
    const remainingAdmins = db.find('users', u => u.is_admin && u.id !== targetId);
    if (remainingAdmins.length === 0) {
      return res.status(400).json({ error: 'Kan ikke fjerne den eneste adminen' });
    }
  }

  db.update('users', u => u.id === targetId, { is_admin: makeAdmin });
  res.json({ success: true });
});

module.exports = router;
