const { WebSocketServer } = require('ws');
const { verifyToken } = require('./auth');

// userId -> Set of open sockets (one user can have several tabs/devices)
const sockets = new Map();

function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    let userId;
    try {
      const token = new URL(req.url, 'http://localhost').searchParams.get('token');
      userId = verifyToken(token).id;
    } catch {
      ws.close(1008, 'Unauthorized');
      return;
    }

    if (!sockets.has(userId)) sockets.set(userId, new Set());
    sockets.get(userId).add(ws);

    ws.on('close', () => {
      const set = sockets.get(userId);
      if (!set) return;
      set.delete(ws);
      if (set.size === 0) sockets.delete(userId);
    });
  });
}

// Send an event to every open connection of one user
function broadcast(userId, event) {
  const set = sockets.get(userId);
  if (!set) return;
  const message = JSON.stringify(event);
  for (const ws of set) {
    if (ws.readyState === 1) ws.send(message);
  }
}

module.exports = { attach, broadcast };
