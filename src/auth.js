const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not set. Copy .env.example to .env and set a real secret.');
}

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// Express middleware: requires "Authorization: Bearer <token>"
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in to continue' });
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please log in again' });
  }
}

module.exports = { signToken, verifyToken, requireAuth };
