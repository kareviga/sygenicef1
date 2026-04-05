const router = require('express').Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// GET /api/league/standings
router.get('/standings', requireAuth, async (req, res) => {
  try {
    const [users, drivers, allPicks, allScores] = await Promise.all([
      db.all('users'),
      db.all('drivers'),
      db.all('user_picks'),
      db.all('user_race_scores'),
    ]);

    const sortedDrivers = drivers.sort((a, b) => b.championship_pts - a.championship_pts);
    const leaderPts = sortedDrivers[0]?.championship_pts || 0;
    const max = parseFloat(await db.getSetting('max_handicap') || '30');

    function handicap(d) {
      if (leaderPts <= 0) return 1.0;
      if (d.championship_pts <= 0) return max;
      return +Math.min(leaderPts / d.championship_pts, max).toFixed(2);
    }

    const standings = users.map(user => {
      const scores = allScores.filter(r => r.user_id === user.id);
      const total = +scores.reduce((s, r) => s + r.score, 0).toFixed(1);
      const picks = allPicks.find(r => r.user_id === user.id);
      const d1 = picks?.driver1_id ? drivers.find(d => d.id === picks.driver1_id) : null;
      const d2 = picks?.driver2_id ? drivers.find(d => d.id === picks.driver2_id) : null;

      return {
        user_id: user.id,
        username: user.username,
        score: total,
        driver1: d1 ? { ...d1, handicap: handicap(d1) } : null,
        driver2: d2 ? { ...d2, handicap: handicap(d2) } : null,
        is_me: user.id === req.user.id,
      };
    });

    standings.sort((a, b) => b.score - a.score);
    res.json(standings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/league/my-races
router.get('/my-races', requireAuth, async (req, res) => {
  try {
    const [scores, races] = await Promise.all([
      db.find('user_race_scores', r => r.user_id === req.user.id),
      db.all('races'),
    ]);
    const enriched = scores.map(s => {
      const race = races.find(r => r.id === s.race_id);
      return { ...s, round: race?.round, race_name: race?.name };
    }).sort((a, b) => b.round - a.round);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/league/settings
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const [picksLocked, races] = await Promise.all([
      db.getSetting('picks_locked'),
      db.all('races'),
    ]);
    const sorted = races.filter(r => !r.cancelled).sort((a, b) => a.round - b.round);
    const nextRace = sorted.find(r => !r.is_completed) || null;
    const completedCount = sorted.filter(r => r.is_completed).length;
    res.json({ picks_locked: picksLocked === '1', next_race: nextRace, completed_races: completedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/league/calendar
router.get('/calendar', requireAuth, async (req, res) => {
  try {
    const races = (await db.all('races'))
      .filter(r => !r.cancelled)
      .sort((a, b) => a.round - b.round);
    res.json(races);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
