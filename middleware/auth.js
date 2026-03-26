const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'f1handicap-dev-secret-change-in-prod';

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, async () => {
    try {
      const user = await db.findOne('users', u => u.id === req.user.id);
      if (!user || !user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: 'Server error during auth' });
    }
  });
}

module.exports = { requireAuth, requireAdmin, JWT_SECRET };
