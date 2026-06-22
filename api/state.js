// api/state.js — shared league storage for the Mickeltitties Cup app.
// Stores ONE JSON blob (names, season, history, rules, draft) that every phone reads & writes,
// so the pool is the same for all 8 people instead of living in each browser.
//
// SETUP (one time): in Vercel → your feed project → Storage → create a KV / Upstash Redis
// database and connect it to the project. That auto-adds KV_REST_API_URL + KV_REST_API_TOKEN.
// (Optional) add MTC_WRITE_KEY to require a password on writes; it must match SYNC_KEY in the app.

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const WRITE_KEY = process.env.MTC_WRITE_KEY || 'mtc-2026';
const SLOT = 'mtc_state';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!KV_URL || !KV_TOKEN) { res.status(500).json({ error: 'kv_not_configured' }); return; }

  // ----- READ -----
  if (req.method === 'GET') {
    try {
      const r = await fetch(`${KV_URL}/get/${SLOT}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
      const j = await r.json();
      if (!j || j.result == null) { res.setHeader('Cache-Control', 'no-store'); res.status(200).json({ empty: true }); return; }
      let payload; try { payload = JSON.parse(j.result); } catch (e) { payload = null; }
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(payload || { empty: true });
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
      const r = await fetch(`${KV_URL}/set/${SLOT}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });
      await r.json();
      res.status(200).json({ ok: true, t: payload.t });
    } catch (e) { res.status(502).json({ error: 'write_failed' }); }
    return;
  }

  res.status(405).json({ error: 'method' });
}
