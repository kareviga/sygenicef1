const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const u = username.trim();
    if (u.length < 2 || u.length > 20) return res.status(400).json({ error: 'Username must be 2–20 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(u)) return res.status(400).json({ error: 'Username: letters, numbers, underscores only' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const existing = await db.findOne('users', r => r.username.toLowerCase() === u.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const hash = bcrypt.hashSync(password, 10);
    const isAdmin = (await db.count('users')) === 0;
    const user = await db.insert('users', { username: u, password_hash: hash, is_admin: isAdmin });

    const token = jwt.sign({ id: user.id, username: u, is_admin: isAdmin }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: u, is_admin: isAdmin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = await db.findOne('users', r => r.username.toLowerCase() === username.trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username, is_admin: user.is_admin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = await db.findOne('users', u => u.id === payload.id);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    res.json({ username: user.username, is_admin: user.is_admin });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;
