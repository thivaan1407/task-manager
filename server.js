require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
require('./src/db');
const realtime = require('./src/realtime');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/tasks', require('./src/routes/tasks'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const server = http.createServer(app);
realtime.attach(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Task Manager running at http://localhost:${PORT}`));
