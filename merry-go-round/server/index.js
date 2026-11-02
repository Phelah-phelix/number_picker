require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const pool = require('./db');

const MAX_REDOS = 3;
const app = express();
app.use(cors());
app.use(express.json());

// ---------- helpers ----------
const makeToken = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const httpErr = (status, message) => Object.assign(new Error(message), { status });

const publicMember = (m) => ({
  id: m.id,
  name: m.name,
  number: m.number,
  submitted: m.submitted,
  redosLeft: MAX_REDOS - m.redos_used,
});

// wraps a route: sends JSON result, or a clean error
const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};

// runs fn inside a transaction with the group row LOCKED,
// so two people can never grab the same number at the same time
async function withGroup(token, fn) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const g = await db.query('SELECT * FROM groups WHERE token = $1 FOR UPDATE', [
      String(token || '').trim().toUpperCase(),
    ]);
    if (!g.rows.length) throw httpErr(404, 'Invalid token');
    const result = await fn(db, g.rows[0]);
    await db.query('COMMIT');
    return result;
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    db.release();
  }
}

const withMember = (req, fn) =>
  withGroup(req.body.token, async (db, g) => {
    const id = parseInt(req.body.memberId, 10);
    if (!id) throw httpErr(400, 'memberId is required');
    const { rows } = await db.query('SELECT * FROM members WHERE id = $1 AND group_id = $2', [id, g.id]);
    if (!rows.length) throw httpErr(404, 'Member not found');
    return fn(db, g, rows[0]);
  });

// picks a random number nobody holds yet (the current one counts as held)
async function pickFree(db, g) {
  const { rows } = await db.query(
    'SELECT number FROM members WHERE group_id = $1 AND number IS NOT NULL',
    [g.id]
  );
  const taken = new Set(rows.map((r) => r.number));
  const free = [];
  for (let n = 1; n <= g.size; n++) if (!taken.has(n)) free.push(n);
  return free.length ? free[crypto.randomInt(free.length)] : null;
}

// ---------- routes ----------
app.get('/api/health', handle(async () => {
  const { rows } = await pool.query('SELECT now()');
  return { ok: true, time: rows[0].now };
}));

// Leader registers a group -> gets a token
app.post('/api/groups', handle(async (req) => {
  const name = (req.body.name || '').trim();
  const size = parseInt(req.body.size, 10);
  if (!name || !(size >= 2 && size <= 100)) {
    throw httpErr(400, 'Group name and size (2-100) are required');
  }
  for (let i = 0; i < 5; i++) {
    try {
      const { rows } = await pool.query(
        'INSERT INTO groups (name, token, size) VALUES ($1, $2, $3) RETURNING id, name, token, size',
        [name, makeToken(), size]
      );
      return rows[0];
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
  }
  throw httpErr(500, 'Could not generate a token, try again');
}));

// Member logs in with name + token (new names join, returning names resume)
app.post('/api/join', handle(async (req) => {
  const name = (req.body.name || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 50) throw httpErr(400, 'Enter your name (max 50 characters)');

  return withGroup(req.body.token, async (db, g) => {
    let { rows } = await db.query(
      'SELECT * FROM members WHERE group_id = $1 AND lower(name) = lower($2)',
      [g.id, name]
    );
    if (!rows.length) {
      const { n } = (await db.query('SELECT count(*)::int AS n FROM members WHERE group_id = $1', [g.id])).rows[0];
      if (n >= g.size) throw httpErr(403, 'This group is already full');
      rows = (await db.query(
        'INSERT INTO members (group_id, name) VALUES ($1, $2) RETURNING *',
        [g.id, name]
      )).rows;
    }
    return { group: { name: g.name, size: g.size }, member: publicMember(rows[0]) };
  });
}));

// First random draw
app.post('/api/draw', handle((req) =>
  withMember(req, async (db, g, m) => {
    if (m.submitted) throw httpErr(409, 'You already submitted your number');
    if (m.number !== null) throw httpErr(409, 'You already drew a number, use redo');
    const n = await pickFree(db, g);
    if (n === null) throw httpErr(409, 'No numbers left');
    const { rows } = await db.query('UPDATE members SET number = $1 WHERE id = $2 RETURNING *', [n, m.id]);
    return publicMember(rows[0]);
  })
));

// Redo (max 3, only before submitting)
app.post('/api/redo', handle((req) =>
  withMember(req, async (db, g, m) => {
    if (m.submitted) throw httpErr(409, 'Submitted numbers cannot be changed');
    if (m.number === null) throw httpErr(409, 'Draw a number first');
    if (m.redos_used >= MAX_REDOS) throw httpErr(409, 'No redos left');
    const n = await pickFree(db, g);
    if (n === null) throw httpErr(409, 'No other number is available');
    const { rows } = await db.query(
      'UPDATE members SET number = $1, redos_used = redos_used + 1 WHERE id = $2 RETURNING *',
      [n, m.id]
    );
    return publicMember(rows[0]);
  })
));

// Submit = final, no undo
app.post('/api/submit', handle((req) =>
  withMember(req, async (db, g, m) => {
    if (m.number === null) throw httpErr(409, 'Draw a number first');
    if (m.submitted) return publicMember(m);
    const { rows } = await db.query('UPDATE members SET submitted = true WHERE id = $1 RETURNING *', [m.id]);
    return publicMember(rows[0]);
  })
));

// Everyone in the group and their numbers
app.get('/api/groups/:token/members', handle(async (req) => {
  const g = await pool.query('SELECT * FROM groups WHERE token = $1', [req.params.token.toUpperCase()]);
  if (!g.rows.length) throw httpErr(404, 'Invalid token');
  const { rows } = await pool.query(
    'SELECT name, number, submitted FROM members WHERE group_id = $1 ORDER BY number NULLS LAST, name',
    [g.rows[0].id]
  );
  return { group: { name: g.rows[0].name, size: g.rows[0].size }, members: rows };
}));

app.listen(process.env.PORT || 4000, () =>
  console.log(`API running on http://localhost:${process.env.PORT || 4000}`)
);
