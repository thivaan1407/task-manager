const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { broadcast } = require('../realtime');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Validates the fields present in body. Returns { error } or { values }.
function validate(body, { partial }) {
  const values = {};

  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (!title) return { error: 'Enter a task title' };
    if (title.length > 120) return { error: 'Title must be 120 characters or fewer' };
    values.title = title;
  }
  if (body.description !== undefined) {
    const description = String(body.description).trim();
    if (description.length > 2000) return { error: 'Description must be 2000 characters or fewer' };
    values.description = description;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return { error: 'Status must be todo, in_progress or done' };
    values.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) return { error: 'Priority must be low, medium or high' };
    values.priority = body.priority;
  }
  if (body.due_date !== undefined) {
    if (body.due_date === null || body.due_date === '') {
      values.due_date = null;
    } else if (!DATE_RE.test(body.due_date) || isNaN(Date.parse(body.due_date))) {
      return { error: 'Due date must be a valid date (YYYY-MM-DD)' };
    } else {
      values.due_date = body.due_date;
    }
  }
  return { values };
}

// Always scope by user_id: users can only ever touch their own tasks.
function findOwned(id, userId) {
  return db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
}

// LIST (with optional ?status=&priority=&q=)
router.get('/', (req, res) => {
  const where = ['user_id = ?'];
  const params = [req.user.id];

  if (STATUSES.includes(req.query.status)) { where.push('status = ?'); params.push(req.query.status); }
  if (PRIORITIES.includes(req.query.priority)) { where.push('priority = ?'); params.push(req.query.priority); }
  if (req.query.q) {
    where.push('(title LIKE ? OR description LIKE ?)');
    const like = `%${String(req.query.q).trim()}%`;
    params.push(like, like);
  }

  const tasks = db
    .prepare(`SELECT * FROM tasks WHERE ${where.join(' AND ')} ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      due_date IS NULL, due_date, created_at DESC`)
    .all(...params);
  res.json({ tasks });
});

// READ ONE
router.get('/:id', (req, res) => {
  const task = findOwned(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ task });
});

// CREATE
router.post('/', (req, res) => {
  const { error, values } = validate(req.body, { partial: false });
  if (error) return res.status(400).json({ error });

  const result = db
    .prepare(`INSERT INTO tasks (user_id, title, description, status, priority, due_date)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(
      req.user.id,
      values.title,
      values.description ?? '',
      values.status ?? 'todo',
      values.priority ?? 'medium',
      values.due_date ?? null
    );

  const task = findOwned(Number(result.lastInsertRowid), req.user.id);
  broadcast(req.user.id, { type: 'task:created', task });
  res.status(201).json({ task });
});

// UPDATE (partial updates allowed, e.g. just { status: 'done' })
router.put('/:id', (req, res) => {
  const existing = findOwned(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const { error, values } = validate(req.body, { partial: true });
  if (error) return res.status(400).json({ error });

  const merged = { ...existing, ...values };
  db.prepare(`UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?,
              due_date = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(merged.title, merged.description, merged.status, merged.priority,
         merged.due_date, existing.id, req.user.id);

  const task = findOwned(existing.id, req.user.id);
  broadcast(req.user.id, { type: 'task:updated', task });
  res.json({ task });
});

// DELETE
router.delete('/:id', (req, res) => {
  const existing = findOwned(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(existing.id, req.user.id);
  broadcast(req.user.id, { type: 'task:deleted', id: existing.id });
  res.json({ success: true });
});

module.exports = router;
