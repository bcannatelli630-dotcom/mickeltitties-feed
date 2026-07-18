// api/leaderboard.js  —  Slash Golf "middleman" for the Mickeltitties Cup app
//
// WHAT THIS DOES: holds your secret RapidAPI key, fetches the live leaderboard from
// Slash Golf, and hands the app a clean, tiny result. Your phones never see the key.
//
// SET ONE THING:  in Vercel, add an Environment Variable named  RAPIDAPI_KEY  =  <your key>
// THEN:           pick the event you're tracking by setting ACTIVE below.

const KEY  = process.env.RAPIDAPI_KEY;
const HOST = 'live-golf-data.p.rapidapi.com';
const ORG  = '1';     // 1 = PGA Tour (all four majors run under it)
const YEAR = '2026';

// Which major is live right now. Change this one word per event:
// 'masters' | 'pga' | 'usopen' | 'open'
const ACTIVE = 'usopen';

// Each major's Slash Golf tournId + display name + first-round tee-off (used to auto-lock the draft).
// IMPORTANT: confirm each tournId from the /schedule endpoint the week of the event (see README).
// The ids below are typical PGA-Tour ids — verify before the event and correct if needed.
const EVENTS = {
  masters: { tournId: '014', name: 'The Masters',      teeOff: '2026-04-09T11:00:00Z' },
  pga:     { tournId: '033', name: 'PGA Championship',  teeOff: '2026-05-14T11:00:00Z' },
  usopen:  { tournId: '026', name: 'U.S. Open',         teeOff: '2026-06-18T11:00:00Z' },
  open:    { tournId: '100', name: 'The Open',          teeOff: '2026-07-16T06:30:00Z' },
};

// Name reconciliation. The draft board (field.js) and this leaderboard BOTH come from the same
// Slash Golf feed, so names already match — do NOT remap here or the app can't find a drafted
// player's score (it would silently show them at Even / made-cut). Leave this empty unless you
// truly need to bridge a manually-typed roster name, and if so add the SAME mapping to field.js.
const ALIAS = {};

export default async function handler(req, res) {
  const sel = (req.query && req.query.event) || ACTIVE;
  const E = EVENTS[sel] || EVENTS[ACTIVE];
  const url = `https://${HOST}/leaderboard?orgId=${ORG}&tournId=${E.tournId}&year=${YEAR}`;

  let raw;
  try {
    raw = await (await fetch(url, {
      headers: { 'X-RapidAPI-Key': KEY, 'X-RapidAPI-Host': HOST }
    })).json();
  } catch (e) {
    res.status(502).json({ error: 'feed_unreachable' });
    return;
  }

  const players = {};
  const needsThru = [];  // playerId+name pairs whose round is in progress but the leaderboard gave no thru
  for (const r of (raw.leaderboardRows || [])) {
    const name = `${r.firstName || ''} ${r.lastName || ''}`.trim();
    if (!name) continue;
    const posStr = String(r.position || '').toUpperCase();
    const statStr = String(r.status || '').toLowerCase();
    const isCut = /^(cut|wd|dq|w\/d)$/.test(statStr) || /^(CUT|WD|DQ|W\/D)$/.test(posStr);
    const teeTs = r.teeTimeTimestamp ? Date.parse(r.teeTimeTimestamp) : NaN;
    const teePassed = !isNaN(teeTs) && Date.now() >= teeTs;
    const totalRaw = (r.total != null && r.total !== '') ? r.total : (r.score != null ? r.score : (r.totalScore != null ? r.totalScore : (r.scoreToPar != null ? r.scoreToPar : null)));
    const started = !!(r.thru || (r.rounds && r.rounds.length) || Number(r.currentRound) > 0 || teePassed || (totalRaw != null && totalRaw !== '' && r.status !== 'not started'));
    players[ALIAS[name] || name] = { score: toPar(totalRaw), cut: !isCut, thru: r.thru || '', started };
    // Leaderboard doesn't populate `thru` mid-round (a known Slash Golf gap) — queue a per-player
    // scorecard lookup for anyone plausibly still out on the course right now.
    if (started && !isCut && !r.thru && r.playerId) needsThru.push({ name: ALIAS[name] || name, playerId: r.playerId });
  }

  // Fill in real hole-progress for in-progress players via /scorecards (bounded + time-capped so
  // a big field can't blow past a function timeout or hammer the rate limit).
  if (needsThru.length) {
    const budget = needsThru.slice(0, 60);
    const started = Date.now();
    await Promise.all(budget.map(async (p) => {
      if (Date.now() - started > 7000) return;  // stop firing new requests past ~7s
      try {
        const sUrl = `https://${HOST}/scorecards?orgId=${ORG}&tournId=${E.tournId}&year=${YEAR}&playerId=${p.playerId}`;
        const sc = await (await fetch(sUrl, { headers: { 'X-RapidAPI-Key': KEY, 'X-RapidAPI-Host': HOST } })).json();
        const rounds = sc.scorecard || sc.rounds || (Array.isArray(sc) ? sc : []);
        if (!rounds.length) return;
        const last = rounds[rounds.length - 1];
        const holes = last.holes || last.holeScores || [];
        const played = holes.filter(h => h && (h.score != null || h.strokes != null)).length;
        if (played > 0 && played < 18) players[p.name].thru = played;
      } catch (e) { /* leave as-is on any per-player failure */ }
    }));
  }

  // Round number: Slash Golf reports this per-player (currentRound), not at the top level.
  // Take the max currentRound across the field so "round 3" (Sat) unlocks cut status app-wide.
  let round = 0;
  for (const r of (raw.leaderboardRows || [])) {
    const cr = Number(r.currentRound || 0);
    if (cr > round) round = cr;
  }

  const body = {
    event:   E.name,
    round,
    status:  /complete|final|official/i.test(raw.status || '') ? 'final' : 'live',
    updated: new Date().toISOString(),
    teeOff:  E.teeOff,
    players,
  };

  // Cache disabled temporarily while confirming the fix — re-enable s-maxage=300 once verified live.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(body);
}

// "-12" -> -12,  "E" -> 0,  "+3" -> 3
function toPar(v) {
  if (v == null) return 0;
  if (typeof v === 'object') { v = v['$numberInt'] ?? v['$numberDouble'] ?? v.value ?? 0; }
  const s = String(v).trim();
  if (s === 'E' || s === '') return 0;
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}
