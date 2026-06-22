// api/state.js — shared league storage using the project's REDIS_URL (Vercel Redis / Upstash).
// Stores ONE JSON blob (names, season, history, rules, draft) that every phone reads & writes.
//
// Requires: REDIS_URL env var (added automatically when you connected the Redis database)
//           and the root package.json in this folder (lists the "ioredis" dependency).
// Optional: MTC_WRITE_KEY env var to require a write password (must match SYNC_KEY in the app).

import Redis from 'ioredis';

const WRITE_KEY = process.env.MTC_WRITE_KEY || 'mtc-2026';
const SLOT = 'mtc_state';

let _redis;
function r() { if (!_redis) { _redis = new Redis(process.env.REDIS_URL); } return _redis; }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!process.env.REDIS_URL) { res.status(500).json({ error: 'redis_not_configured' }); return; }

  // ----- READ -----
  if (req.method === 'GET') {
    try {
      const v = await r().get(SLOT);
      res.setHeader('Cache-Control', 'no-store');
      if (v == null) { res.status(200).json({ empty: true }); return; }
      let p; try { p = JSON.parse(v); } catch (e) { p = null; }
      res.status(200).json(p || { empty: true });
    } catch (e) { res.status(502).json({ error: 'read_failed' }); }
    return;
  }

  // ----- WRITE -----
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || body.key !== WRITE_KEY) { res.status(403).json({ error: 'bad_key' }); return; }
    const payload = body.payload;
    if (!payload || !payload.data) { res.status(400).json({ error: 'bad_payload' }); return; }
    try {
      await r().set(SLOT, JSON.stringify(payload));
      res.status(200).json({ ok: true, t: payload.t });
    } catch (e) { res.status(502).json({ error: 'write_failed' }); }
    return;
  }

  res.status(405).json({ error: 'method' });
}
