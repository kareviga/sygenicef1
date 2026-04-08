/**
 * Returns the lock deadline for a race as an ISO UTC datetime string.
 * If fp1_at is set, locks exactly at FP1 start time.
 * Fallback (no fp1_at): end of the day before the race weekend starts.
 */
function getRaceDeadline(race) {
  if (!race) return null;
  if (race.fp1_at) return race.fp1_at; // exact FP1 UTC time
  // Fallback for races without fp1_at
  if (!race.date) return null;
  const raceDay = new Date(race.date + 'T00:00:00Z');
  const daysBack = race.has_sprint ? 4 : 3;
  const deadline = new Date(raceDay);
  deadline.setUTCDate(deadline.getUTCDate() - daysBack);
  deadline.setUTCHours(23, 59, 59, 0);
  return deadline.toISOString();
}

/**
 * Returns true if picks/bets should be locked (current time is at or past FP1).
 */
function isAutoLocked(nextRace) {
  const deadline = getRaceDeadline(nextRace);
  if (!deadline) return false;
  return new Date() >= new Date(deadline);
}

module.exports = { getRaceDeadline, isAutoLocked };
