const router = require('express').Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { isAutoLocked } = require('../utils/deadline');

// available = total HC score + net settled winnings − locked in active bets
function computeBalance(userId, hcScores, allBets) {
  const total_hc = +hcScores
    .filter(s => s.user_id === userId)
    .reduce((s, r) => s + r.score, 0)
    .toFixed(1);

  const net_bet = +allBets
    .filter(b => b.status === 'settled' && (b.creator_id === userId || b.acceptor_id === userId))
    .reduce((s, b) => b.winner_id === null ? s : b.winner_id === userId ? s + b.points : s - b.points, 0)
    .toFixed(1);

  const locked = +allBets
    .filter(b => ['open', 'accepted'].includes(b.status) && (b.creator_id === userId || b.acceptor_id === userId))
    .reduce((s, b) => s + b.points, 0)
    .toFixed(1);

  return { total_hc, net_bet, available: +Math.max(0, total_hc + net_bet - locked).toFixed(1) };
}

function enrichBet(b, driverMap, userMap, userId, races) {
  const race = races.find(r => r.id === b.race_id);
  return {
    ...b,
    creator_name:  userMap[b.creator_id]  || '?',
    acceptor_name: b.acceptor_id ? userMap[b.acceptor_id] : null,
    driver_above:  driverMap[b.driver_above_id] || null,
    driver_below:  driverMap[b.driver_below_id] || null,
    winner_name:   b.winner_id ? userMap[b.winner_id] : null,
    is_mine:       b.creator_id === userId,
    i_accepted:    b.acceptor_id === userId,
    race_round:    race?.round,
    race_name:     race?.name,
  };
}

// GET /api/bets
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [allBets, hcScores, drivers, users, races] = await Promise.all([
      db.all('bets'),
      db.all('user_race_scores'),
      db.all('drivers'),
      db.all('users'),
      db.all('races'),
    ]);

    const balance  = computeBalance(userId, hcScores, allBets);
    const driverMap = Object.fromEntries(drivers.map(d => [d.id, { id: d.id, short_name: d.short_name, team_color: d.team_color }]));
    const userMap   = Object.fromEntries(users.map(u => [u.id, u.username]));

    const nextRace = races
      .filter(r => !r.cancelled && !r.is_completed)
      .sort((a, b) => a.round - b.round)[0] || null;

    // Open bets for next race not created by me
    const pool = nextRace
      ? allBets
          .filter(b => b.race_id === nextRace.id && b.status === 'open' && b.creator_id !== userId)
          .map(b => enrichBet(b, driverMap, userMap, userId, races))
      : [];

    // My bets (creator or acceptor), newest first — hide cancelled
    const my_bets = allBets
      .filter(b => (b.creator_id === userId || b.acceptor_id === userId) && b.status !== 'cancelled')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(b => enrichBet(b, driverMap, userMap, userId, races));

    const driverList = drivers
      .sort((a, b) => b.championship_pts - a.championship_pts)
      .map(d => ({ id: d.id, short_name: d.short_name, team_color: d.team_color }));

    res.json({ balance, next_race: nextRace, pool, my_bets, drivers: driverList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bets — create a bet
router.post('/', requireAuth, async (req, res) => {
  try {
    const { race_id, driver_above_id, driver_below_id, points } = req.body;
    if (!race_id || !driver_above_id || !driver_below_id || !points) {
      return res.status(400).json({ error: 'Alle felt er påkrevd' });
    }
    if (driver_above_id === driver_below_id) {
      return res.status(400).json({ error: 'Velg to forskjellige førere' });
    }
    const pts = parseFloat(points);
    if (!pts || pts <= 0) return res.status(400).json({ error: 'Poeng må være større enn 0' });

    const [picksLocked, allRaces, allBets, hcScores] = await Promise.all([
      db.getSetting('picks_locked'),
      db.all('races'),
      db.all('bets'),
      db.all('user_race_scores'),
    ]);
    const nextRace = allRaces.filter(r => !r.cancelled && !r.is_completed).sort((a, b) => a.round - b.round)[0] || null;
    if (picksLocked === '1' || isAutoLocked(nextRace)) {
      return res.status(403).json({ error: 'Bets er låst for denne race-helgen' });
    }

    const race = allRaces.find(r => r.id === parseInt(race_id));
    if (!race || race.is_completed || race.cancelled) {
      return res.status(400).json({ error: 'Ugyldig race' });
    }

    const { available } = computeBalance(req.user.id, hcScores, allBets);
    if (pts > available) {
      return res.status(400).json({ error: `Du har bare ${available} tilgjengelige poeng` });
    }

    const bet = await db.insert('bets', {
      race_id: parseInt(race_id),
      creator_id: req.user.id,
      driver_above_id: parseInt(driver_above_id),
      driver_below_id: parseInt(driver_below_id),
      points: pts,
      status: 'open',
    });
    res.json(bet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bets/:id/accept
router.put('/:id/accept', requireAuth, async (req, res) => {
  try {
    const betId = parseInt(req.params.id);
    const [bet, allBets, hcScores, picksLocked, allRaces] = await Promise.all([
      db.findOne('bets', b => b.id === betId),
      db.all('bets'),
      db.all('user_race_scores'),
      db.getSetting('picks_locked'),
      db.all('races'),
    ]);
    const nextRace = allRaces.filter(r => !r.cancelled && !r.is_completed).sort((a, b) => a.round - b.round)[0] || null;
    if (picksLocked === '1' || isAutoLocked(nextRace)) {
      return res.status(403).json({ error: 'Bets er låst for denne race-helgen' });
    }
    if (!bet)                            return res.status(404).json({ error: 'Bet ikke funnet' });
    if (bet.status !== 'open')           return res.status(400).json({ error: 'Bet er ikke lenger åpent' });
    if (bet.creator_id === req.user.id)  return res.status(400).json({ error: 'Du kan ikke akseptere ditt eget bet' });

    // Exclude this open bet from the acceptor's locked total (it's not theirs yet)
    const otherBets = allBets.filter(b => b.id !== betId);
    const { available } = computeBalance(req.user.id, hcScores, otherBets);
    if (bet.points > available) {
      return res.status(400).json({ error: `Du har bare ${available} tilgjengelige poeng` });
    }

    await db.update('bets', b => b.id === betId, { status: 'accepted', acceptor_id: req.user.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bets/:id — cancel a bet (either party, before race locks)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const betId = parseInt(req.params.id);
    const [bet, picksLocked, allRaces] = await Promise.all([
      db.findOne('bets', b => b.id === betId),
      db.getSetting('picks_locked'),
      db.all('races'),
    ]);
    if (!bet) return res.status(404).json({ error: 'Bet ikke funnet' });

    const isParticipant = bet.creator_id === req.user.id || bet.acceptor_id === req.user.id;
    if (!isParticipant) return res.status(403).json({ error: 'Ikke ditt bet' });

    if (!['open', 'accepted'].includes(bet.status)) {
      return res.status(400).json({ error: 'Kan bare avbryte åpne eller aksepterte bets' });
    }

    // Once race weekend starts, bets are locked in
    const nextRace = allRaces.filter(r => !r.cancelled && !r.is_completed).sort((a, b) => a.round - b.round)[0] || null;
    if (picksLocked === '1' || isAutoLocked(nextRace)) {
      return res.status(403).json({ error: 'Race-helgen har startet — bets kan ikke avbrytes' });
    }

    await db.update('bets', b => b.id === betId, { status: 'cancelled', acceptor_id: null });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
