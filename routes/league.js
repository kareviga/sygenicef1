const router = require('express').Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { getRaceDeadline, isAutoLocked } = require('../utils/deadline');

// GET /api/league/standings
router.get('/standings', requireAuth, async (req, res) => {
  try {
    const [users, drivers, allScores, races] = await Promise.all([
      db.all('users'),
      db.all('drivers'),
      db.all('user_race_scores'),
      db.all('races'),
    ]);

    const sortedDrivers = drivers.sort((a, b) => b.championship_pts - a.championship_pts);
    const leaderPts = sortedDrivers[0]?.championship_pts || 0;
    const nextRace = races.filter(r => !r.cancelled && !r.is_completed).sort((a, b) => a.round - b.round)[0] || null;
    const lastRaceForMax = races.filter(r => r.is_completed && !r.cancelled).sort((a, b) => b.round - a.round)[0] || null;
    const maxRound = nextRace?.round || (lastRaceForMax?.round ? lastRaceForMax.round + 1 : 1);
    const max = maxRound * 10;

    function handicap(d) {
      if (leaderPts <= 0) return 1.0;
      if (d.championship_pts <= 0) return max;
      return +Math.min(leaderPts / d.championship_pts, max).toFixed(2);
    }

    // Last completed non-cancelled race — used to show which drivers each user had
    const lastRace = races
      .filter(r => r.is_completed && !r.cancelled)
      .sort((a, b) => b.round - a.round)[0] || null;

    const standings = users.map(user => {
      const scores = allScores.filter(r => r.user_id === user.id);
      const total = +scores.reduce((s, r) => s + r.score, 0).toFixed(1);

      // Drivers from the last completed race (what they actually raced with)
      const lastScore = lastRace ? scores.find(s => s.race_id === lastRace.id) : null;
      const d1 = lastScore?.driver1_id ? drivers.find(d => d.id === lastScore.driver1_id) : null;
      const d2 = lastScore?.driver2_id ? drivers.find(d => d.id === lastScore.driver2_id) : null;

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
    res.json({ standings, last_round: lastRace?.round || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/league/my-races
router.get('/my-races', requireAuth, async (req, res) => {
  try {
    const [scores, races] = await Promise.all([
      db.find('user_race_scores', r => r.user_id === req.user.id),
      db.find('races', r => r.is_completed && !r.cancelled),
    ]);
    const result = races
      .sort((a, b) => b.round - a.round)
      .map(race => {
        const s = scores.find(s => s.race_id === race.id);
        return {
          race_id: race.id,
          round: race.round,
          race_name: race.name,
          score: s?.score ?? 0,
          driver1_id: s?.driver1_id ?? null,
          driver2_id: s?.driver2_id ?? null,
          driver1_name: s?.driver1_name ?? null,
          driver2_name: s?.driver2_name ?? null,
        };
      });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/league/races/:raceId/detail
router.get('/races/:raceId/detail', requireAuth, async (req, res) => {
  try {
    const raceId = parseInt(req.params.raceId);
    const [race, allRaces, allResults, allDrivers] = await Promise.all([
      db.findOne('races', r => r.id === raceId),
      db.all('races'),
      db.all('race_results'),
      db.all('drivers'),
    ]);
    if (!race) return res.status(404).json({ error: 'Race not found' });

    const maxHandicap = race.round * 10;

    // Points scored in this race
    const racePointsMap = {};
    for (const r of allResults.filter(r => r.race_id === raceId)) {
      racePointsMap[r.driver_id] = r.points;
    }

    // HC is based on standings BEFORE this race (rounds strictly less than this one)
    const prevIds = new Set(
      allRaces.filter(r => r.is_completed && r.round < race.round).map(r => r.id)
    );
    const cumPts = {};
    for (const r of allResults.filter(r => prevIds.has(r.race_id))) {
      cumPts[r.driver_id] = (cumPts[r.driver_id] || 0) + r.points;
    }

    const leaderPts = Math.max(...Object.values(cumPts), 0);

    function getHC(driverId) {
      if (leaderPts <= 0) return 1.0; // R1: no prior races, everyone ×1
      const pts = cumPts[driverId] || 0;
      if (pts <= 0) return maxHandicap;
      return +Math.min(leaderPts / pts, maxHandicap).toFixed(2);
    }

    const drivers = allDrivers.map(d => {
      const race_pts = racePointsMap[d.id] || 0;
      const hc = getHC(d.id);
      return {
        id: d.id,
        short_name: d.short_name,
        team_color: d.team_color,
        race_pts,
        hc,
        hc_pts: +(race_pts * hc).toFixed(2),
      };
    });

    res.json(drivers);
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
    const deadline = getRaceDeadline(nextRace);
    const locked = picksLocked === '1' || isAutoLocked(nextRace);
    res.json({ picks_locked: locked, picks_locked_manual: picksLocked === '1', next_race: nextRace, completed_races: completedCount, deadline });
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
