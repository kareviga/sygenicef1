const db = require('../db/database');

async function computeRaceScores(raceId) {
  const race = await db.findOne('races', r => r.id === raceId);
  if (!race) throw new Error('Race not found');

  const results = await db.find('race_results', r => r.race_id === raceId);
  if (results.length === 0) throw new Error('No results entered for this race');

  const racePoints = {};
  for (const r of results) racePoints[r.driver_id] = r.points;

  const completedRaces = await db.find('races', r => r.is_completed);
  const allRelevantRaceIds = new Set([...completedRaces.map(r => r.id), raceId]);

  const allResults = await db.find('race_results', r => allRelevantRaceIds.has(r.race_id));
  const cumPts = {};
  for (const r of allResults) {
    cumPts[r.driver_id] = (cumPts[r.driver_id] || 0) + r.points;
  }

  const leaderPts = Math.max(...Object.values(cumPts), 1);
  const maxHandicap = parseFloat(await db.getSetting('max_handicap') || '30');

  function getHandicap(driverId) {
    const pts = cumPts[driverId] || 0;
    if (pts <= 0) return maxHandicap;
    return Math.min(leaderPts / pts, maxHandicap);
  }

  // Update cached championship_pts on each driver
  for (const [driverId, pts] of Object.entries(cumPts)) {
    await db.update('drivers', d => d.id === parseInt(driverId), { championship_pts: pts });
  }

  // Fetch all users and picks in one batch
  const [users, allPicks, allDrivers] = await Promise.all([
    db.all('users'),
    db.all('user_picks'),
    db.all('drivers'),
  ]);

  for (const user of users) {
    const picks = allPicks.find(r => r.user_id === user.id);
    if (!picks?.driver1_id || !picks?.driver2_id) continue;

    const d1 = allDrivers.find(d => d.id === picks.driver1_id);
    const d2 = allDrivers.find(d => d.id === picks.driver2_id);
    if (!d1 || !d2) continue;

    const pts1 = racePoints[d1.id] || 0;
    const pts2 = racePoints[d2.id] || 0;
    const hc1 = getHandicap(d1.id);
    const hc2 = getHandicap(d2.id);
    const score = +(pts1 * hc1 + pts2 * hc2).toFixed(2);

    await db.upsertBy(
      'user_race_scores',
      r => r.user_id === user.id && r.race_id === raceId,
      {
        user_id: user.id, race_id: raceId, score,
        driver1_id: d1.id, driver2_id: d2.id,
        driver1_name: d1.name, driver2_name: d2.name,
        driver1_race_pts: pts1, driver1_hc: +hc1.toFixed(2),
        driver2_race_pts: pts2, driver2_hc: +hc2.toFixed(2),
      }
    );
  }

  await db.update('races', r => r.id === raceId, { is_completed: true });
}

async function clearRaceScores(raceId) {
  await db.delete('race_results', r => r.race_id === raceId);
  await db.delete('user_race_scores', r => r.race_id === raceId);
  await db.update('races', r => r.id === raceId, { is_completed: false });

  const [drivers, completedRaces, allResults] = await Promise.all([
    db.all('drivers'),
    db.find('races', r => r.is_completed),
    db.all('race_results'),
  ]);

  const completedRaceIds = new Set(completedRaces.map(r => r.id));
  for (const driver of drivers) {
    const total = allResults
      .filter(r => r.driver_id === driver.id && completedRaceIds.has(r.race_id))
      .reduce((s, r) => s + r.points, 0);
    await db.update('drivers', d => d.id === driver.id, { championship_pts: total });
  }
}

module.exports = { computeRaceScores, clearRaceScores };
