/**
 * Returns the deadline date (YYYY-MM-DD) for driver changes before a race.
 * Deadline = day before the race weekend starts.
 * Regular weekend starts Friday (race_date - 2), so deadline = race_date - 3.
 * Sprint weekend starts Thursday (race_date - 3), so deadline = race_date - 4.
 */
function getRaceDeadline(race) {
  if (!race?.date) return null;
  const raceDay = new Date(race.date + 'T00:00:00Z');
  const daysBack = race.has_sprint ? 4 : 3;
  const deadline = new Date(raceDay);
  deadline.setUTCDate(deadline.getUTCDate() - daysBack);
  return deadline.toISOString().split('T')[0];
}

/**
 * Returns true if picks should be auto-locked based on the next race deadline.
 * Picks are locked from the day the race weekend starts (i.e. the day after deadline).
 */
function isAutoLocked(nextRace) {
  const deadline = getRaceDeadline(nextRace);
  if (!deadline) return false;
  const today = new Date().toISOString().split('T')[0];
  return today > deadline;
}

module.exports = { getRaceDeadline, isAutoLocked };
