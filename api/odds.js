// api/odds.js — golf outright winner odds from The Odds API (free tier).
// Sign up at https://the-odds-api.com, set ODDS_API_KEY in Vercel env vars.
// Maps the active major to its sport_key on The Odds API.

const KEY = process.env.ODDS_API_KEY;
const HOST = 'https://api.the-odds-api.com/v4/sports';

// The Odds API's per-major outright market keys (confirm/update each season if they change).
const SPORT_KEYS = {
  masters: 'golf_masters_tournament_winner',
  pga:     'golf_pga_championship_winner',
  usopen:  'golf_us_open_winner',
  open:    'golf_the_open_championship_winner',
};

export default async function handler(req, res) {
  const sel = (req.query && req.query.event) || 'usopen';
  const sportKey = SPORT_KEYS[sel];
  if (!sportKey) { res.status(200).json({ event: sel, odds: [] }); return; }

  const url = `${HOST}/${sportKey}/odds?regions=us&markets=outrights&oddsFormat=american&apiKey=${KEY}`;

  let raw;
  try {
    const r = await fetch(url);
    if (!r.ok) { res.status(200).json({ event: sel, odds: [] }); return; } // no market yet (too early) — fail soft
    raw = await r.json();
  } catch (e) {
    res.status(200).json({ event: sel, odds: [] });
    return;
  }

  // Take the first bookmaker's outrights market and return name + price.
  const book = (raw[0] && raw[0].bookmakers && raw[0].bookmakers[0]) || null;
  const market = book && book.markets && book.markets.find(m => m.key === 'outrights');
  const odds = (market ? market.outcomes : []).map(o => ({ name: o.name, price: o.price }));

  res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=3600'); // 12h — free tier is request-limited
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ event: sel, odds });
}
