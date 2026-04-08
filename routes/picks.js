const router = require('express').Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { isAutoLocked } = require('../utils/deadline');

function calcHandicap(driverPts, leaderPts, maxHandicap) {
  if (leaderPts <= 0) return 1.0;
  if (driverPts <= 0) return maxHandicap;
  return Math.min(leaderPts / driverPts, maxHandicap);
}

function enrichDriver(d, leaderPts, maxHandicap) {
  return { ...d, handicap: +calcHandicap(d.championship_pts, leaderPts, maxHandicap).toFixed(2) };
}

// GET /api/picks/drivers
router.get('/drivers', requireAuth, async (req, res) => {
  try {
    const [drivers, races] = await Promise.all([
      db.all('drivers'),
      db.all('races'),
    ]);
    drivers.sort((a, b) => b.championship_pts - a.championship_pts);
    const leaderPts = drivers[0]?.championship_pts || 0;
    const nextRace = races.filter(r => !r.cancelled && !r.is_completed).sort((a, b) => a.round - b.round)[0] || null;
    const lastRace = races.filter(r => r.is_completed && !r.cancelled).sort((a, b) => b.round - a.round)[0] || null;
    const maxRound = nextRace?.round || (lastRace?.round ? lastRace.round + 1 : 1);
    const max = maxRound * 10;
    res.json(drivers.map(d => enrichDriver(d, leaderPts, max)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/picks/my
router.get('/my', requireAuth, async (req, res) => {
  try {
    const picks = await db.findOne('user_picks', r => r.user_id === req.user.id);
    if (!picks) return res.json({ driver1: null, driver2: null, swaps_used: 0 });

    const [drivers, races] = await Promise.all([db.all('drivers'), db.all('races')]);
    drivers.sort((a, b) => b.championship_pts - a.championship_pts);
    const leaderPts = drivers[0]?.championship_pts || 0;
    const nextRace = races.filter(r => !r.cancelled && !r.is_completed).sort((a, b) => a.round - b.round)[0] || null;
    const lastRace = races.filter(r => r.is_completed && !r.cancelled).sort((a, b) => b.round - a.round)[0] || null;
    const maxRound = nextRace?.round || (lastRace?.round ? lastRace.round + 1 : 1);
    const max = maxRound * 10;

    const d1 = picks.driver1_id ? await db.findOne('drivers', d => d.id === picks.driver1_id) : null;
    const d2 = picks.driver2_id ? await db.findOne('drivers', d => d.id === picks.driver2_id) : null;

    res.json({
      driver1: d1 ? enrichDriver(d1, leaderPts, max) : null,
      driver2: d2 ? enrichDriver(d2, leaderPts, max) : null,
      swaps_used: picks.swaps_used,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/picks
router.put('/', requireAuth, async (req, res) => {
  try {
    const [picksLocked, races] = await Promise.all([
      db.getSetting('picks_locked'),
      db.all('races'),
    ]);
    const nextRace = races.filter(r => !r.cancelled).sort((a, b) => a.round - b.round).find(r => !r.is_completed) || null;
    if (picksLocked === '1' || isAutoLocked(nextRace)) {
      return res.status(403).json({ error: 'Picks are locked — race weekend in progress' });
    }

    const { driver1_id, driver2_id } = req.body;
    if (!driver1_id || !driver2_id) return res.status(400).json({ error: 'Must select 2 drivers' });
    if (driver1_id === driver2_id) return res.status(400).json({ error: 'Must select 2 different drivers' });

    const [d1, d2] = await Promise.all([
      db.findOne('drivers', d => d.id === driver1_id),
      db.findOne('drivers', d => d.id === driver2_id),
    ]);
    if (!d1 || !d2) return res.status(400).json({ error: 'Invalid driver selection' });

    const existing = await db.findOne('user_picks', r => r.user_id === req.user.id);
    const hasExisting = !!(existing?.driver1_id);
    const currentSwaps = existing?.swaps_used || 0;

    // Count only the drivers that actually changed
    let changesCount = 0;
    if (hasExisting) {
      if (driver1_id !== existing.driver1_id) changesCount++;
      if (driver2_id !== existing.driver2_id) changesCount++;
    }

    if (hasExisting && currentSwaps + changesCount > 10) {
      const remaining = 10 - currentSwaps;
      if (remaining <= 0) {
        return res.status(400).json({ error: 'Du har brukt alle 10 byttene dine for sesongen' });
      }
      return res.status(400).json({ error: `Du har bare ${remaining} bytte${remaining === 1 ? '' : 'r'} igjen — du kan ikke bytte begge sjåfører samtidig` });
    }

    const swapsUsed = currentSwaps + changesCount;

    await db.upsert('user_picks', 'user_id', req.user.id, {
      user_id: req.user.id, driver1_id, driver2_id,
      swaps_used: swapsUsed,
      last_updated: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
