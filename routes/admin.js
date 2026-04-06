const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { computeRaceScores, clearRaceScores } = require('../services/scoringService');

// POST /api/admin/lock
router.post('/lock', requireAdmin, async (req, res) => {
  try {
    const current = await db.getSetting('picks_locked');
    const newVal = current === '1' ? '0' : '1';
    await db.setSetting('picks_locked', newVal);
    res.json({ picks_locked: newVal === '1' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/races
router.get('/races', requireAdmin, async (req, res) => {
  try {
    const races = (await db.all('races')).sort((a, b) => a.round - b.round);
    res.json(races);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/races
router.post('/races', requireAdmin, async (req, res) => {
  try {
    const { round, name, circuit, date } = req.body;
    if (!round || !name || !circuit || !date) return res.status(400).json({ error: 'All fields required' });
    const race = await db.insert('races', { round: parseInt(round), name, circuit, date, is_completed: false, has_sprint: false });
    res.json({ id: race.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/races/:id/results
router.post('/races/:id/results', requireAdmin, async (req, res) => {
  const raceId = parseInt(req.params.id);
  const { results } = req.body;
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: 'results array required' });
  }

  try {
    await clearRaceScores(raceId);

    for (const r of results) {
      if (r.points > 0) {
        await db.upsertBy(
          'race_results',
          x => x.race_id === raceId && x.driver_id === r.driver_id,
          { race_id: raceId, driver_id: r.driver_id, points: r.points }
        );
      }
    }

    await computeRaceScores(raceId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/admin/races/:id/results
router.delete('/races/:id/results', requireAdmin, async (req, res) => {
  try {
    await clearRaceScores(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/drivers
router.get('/drivers', requireAdmin, async (req, res) => {
  try {
    const drivers = (await db.all('drivers')).sort((a, b) => b.championship_pts - a.championship_pts);
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/drivers/:id
router.put('/drivers/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { championship_pts, team, team_color } = req.body;
    const updates = {};
    if (championship_pts !== undefined) updates.championship_pts = parseInt(championship_pts);
    if (team) updates.team = team;
    if (team_color) updates.team_color = team_color;
    await db.update('drivers', d => d.id === id, updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const [users, allPicks, drivers] = await Promise.all([
      db.all('users'),
      db.all('user_picks'),
      db.all('drivers'),
    ]);
    const result = users.map(u => {
      const picks = allPicks.find(r => r.user_id === u.id);
      const d1 = picks?.driver1_id ? drivers.find(d => d.id === picks.driver1_id)?.name : null;
      const d2 = picks?.driver2_id ? drivers.find(d => d.id === picks.driver2_id)?.name : null;
      const { password_hash, ...safe } = u;
      return { ...safe, driver1: d1, driver2: d2, swaps_used: picks?.swaps_used || 0 };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/password
router.put('/users/:id/password', requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: 'Passord må være minst 4 tegn' });
    const hash = bcrypt.hashSync(password, 10);
    await db.update('users', u => u.id === targetId, { password_hash: hash });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/role
router.put('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const makeAdmin = !!req.body.is_admin;
    if (!makeAdmin) {
      const allUsers = await db.all('users');
      const remainingAdmins = allUsers.filter(u => u.is_admin && u.id !== targetId);
      if (remainingAdmins.length === 0) {
        return res.status(400).json({ error: 'Kan ikke fjerne den eneste adminen' });
      }
    }
    await db.update('users', u => u.id === targetId, { is_admin: makeAdmin });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/fetch-results?round=X&year=Y
router.get('/fetch-results', requireAdmin, async (req, res) => {
  const { round, year } = req.query;
  if (!round || !year) return res.status(400).json({ error: 'round og year påkrevd' });

  const base = `https://api.jolpi.ca/ergast/f1/${year}/${round}`;

  try {
    const [raceRes, sprintRes] = await Promise.allSettled([
      fetch(`${base}/results.json`).then(r => r.json()),
      fetch(`${base}/sprint.json`).then(r => r.json()),
    ]);

    const raceResults   = raceRes.status   === 'fulfilled' ? (raceRes.value?.MRData?.RaceTable?.Races?.[0]?.Results        || []) : [];
    const sprintResults = sprintRes.status === 'fulfilled' ? (sprintRes.value?.MRData?.RaceTable?.Races?.[0]?.SprintResults || []) : [];

    if (raceResults.length === 0) {
      return res.status(404).json({ error: `Ingen resultater funnet for runde ${round} (${year}).` });
    }

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

    const drivers = await db.all('drivers');
    const matched = [], unmatched = [];

    for (const [numStr, data] of Object.entries(ptsMap)) {
      const num = parseInt(numStr);
      const driver = drivers.find(d => d.number === num);
      const total = data.race_pts + data.sprint_pts;
      if (driver) {
        matched.push({ driver_id: driver.id, driver_number: driver.number, driver_name: driver.name, race_pts: data.race_pts, sprint_pts: data.sprint_pts, total_pts: total });
      } else if (total > 0) {
        unmatched.push({ number: num, api_name: data.api_name, total_pts: total });
      }
    }

    matched.sort((a, b) => b.total_pts - a.total_pts);
    res.json({ matched, unmatched, has_sprint: sprintResults.length > 0, race_name: raceRes.value?.MRData?.RaceTable?.Races?.[0]?.raceName || '' });
  } catch (err) {
    res.status(500).json({ error: 'Nettverksfeil: ' + err.message });
  }
});

// GET /api/admin/settings
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    res.json(await db.allSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/settings/:key
router.put('/settings/:key', requireAdmin, async (req, res) => {
  try {
    await db.setSetting(req.params.key, req.body.value);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
