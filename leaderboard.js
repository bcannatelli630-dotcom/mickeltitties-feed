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

// If Slash Golf spells a name differently than your roster, map it here (feedName: rosterName).
const ALIAS = { 'Matt Fitzpatrick': 'Matthew Fitzpatrick' };

export default async function handler(req, res) {
  const E = EVENTS[ACTIVE];
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
  for (const r of (raw.leaderboardRows || [])) {
    const name = `${r.firstName || ''} ${r.lastName || ''}`.trim();
    if (!name) continue;
    players[ALIAS[name] || name] = {
      score: toPar(r.total),
      cut:   !(r.status === 'cut' || r.status === 'wd' || r.position === 'CUT'),
      thru:  r.thru || '',
    };
  }

  const body = {
    event:   E.name,
    round:   Number(raw.roundId?.['$numberInt'] ?? raw.roundId ?? 0),
    status:  /complete|final|official/i.test(raw.status || '') ? 'final' : 'live',
    updated: new Date().toISOString(),
    teeOff:  E.teeOff,
    players,
  };

  // Edge cache: 8 people refreshing only hits Slash Golf once per 5 min.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(body);
}

// "-12" -> -12,  "E" -> 0,  "+3" -> 3
function toPar(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (s === 'E' || s === '') return 0;
  return parseInt(s, 10);
}
