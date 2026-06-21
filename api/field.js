// api/field.js  —  the entry list for the draft board (pull ~1 week before the event)
// Same setup as leaderboard.js: uses RAPIDAPI_KEY and the ACTIVE event.

const KEY  = process.env.RAPIDAPI_KEY;
const HOST = 'live-golf-data.p.rapidapi.com';
const ORG  = '1';
const YEAR = '2026';
const ACTIVE = 'usopen'; // keep in sync with leaderboard.js

const EVENTS = {
  masters: { tournId: '014', name: 'The Masters' },
  pga:     { tournId: '033', name: 'PGA Championship' },
  usopen:  { tournId: '026', name: 'U.S. Open' },
  open:    { tournId: '100', name: 'The Open' },
};

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

  const field = (raw.leaderboardRows || [])
    .map(r => ({ name: `${r.firstName || ''} ${r.lastName || ''}`.trim(), country: '', odds: '' }))
    .filter(p => p.name);

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ event: E.name, field });
}
