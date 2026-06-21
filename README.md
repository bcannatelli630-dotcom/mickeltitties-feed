# Mickeltitties Cup — Slash Golf hookup (developer one-pager)

You've been handed a finished phone app plus this small "middleman" folder. The app already
does all the golf scoring; the middleman just feeds it live scores from Slash Golf without
exposing the API key. **Total job: ~1 hour.**

## What's in this folder
- `api/leaderboard.js` — fetches the live leaderboard, normalizes it, serves clean JSON.
- `api/field.js` — entry list for the draft board (pull ~1 week before the event).
- `vercel.json` — runs the leaderboard every 5 minutes (warm cache).
- `.env.example` — the one secret you set.

## Deploy (Vercel, free tier is fine)
1. `npm i -g vercel`
2. Put this folder somewhere and run `vercel` in it (or drag it into the Vercel dashboard).
3. In Vercel → Project → Settings → Environment Variables, add:
   `RAPIDAPI_KEY = <the key from RapidAPI → Live Golf Data>`
   (Regenerate the key first if it was ever shared in a screenshot.)
4. Redeploy. You now have two live URLs:
   - `https://<your-project>.vercel.app/api/leaderboard`
   - `https://<your-project>.vercel.app/api/field`
   Open the first in a browser during a tournament — you should see `{ "players": { ... } }`.

## Point the app at it
In `Mickeltitties Cup.dc.html`, in the logic class near the top, set:
```js
LIVE_ENDPOINT = 'https://<your-project>.vercel.app/api/leaderboard';
USE_LIVE_FEED = true;
```
Re-bundle the standalone (or deploy the `.dc.html` + `support.js`) and the app shows live data.
The poll interval is in `componentDidMount` (`this._poll`) — set it to `5 * 60 * 1000`.

## Per-event switch (4x a year)
In BOTH `api/leaderboard.js` and `api/field.js`, set `ACTIVE` to the current major:
`'masters' | 'pga' | 'usopen' | 'open'`. Then **verify that event's `tournId`** from the schedule:
```
GET https://live-golf-data.p.rapidapi.com/schedule?orgId=1&year=2026
  headers: X-RapidAPI-Key, X-RapidAPI-Host: live-golf-data.p.rapidapi.com
```
Find the major in the response, copy its `tournId` into the `EVENTS` map, redeploy. (The ids in
the files are typical PGA-Tour ids but MUST be confirmed each event.)

## The data contract (why the app "just works")
The app only needs two facts per golfer — score to par, and made/missed cut:
```json
{ "event":"U.S. Open", "updated":"...", "teeOff":"...", "players":{
    "Scottie Scheffler": { "score": -12, "cut": true, "thru": "16" } } }
```
Everything else (best 4 of 5, missed-cut penalty, pots, season points, draft auto-lock) is
computed inside the app. Swapping providers later means rewriting only `api/leaderboard.js`.

## Gotchas
- **Names must match the roster.** Slash Golf gives first/last separately; we join with a space.
  Add mismatches to the `ALIAS` map in `api/leaderboard.js`.
- **Rate limits.** The 5-min edge cache keeps you on the free/Basic plan even with everyone refreshing.
- **CORS.** Set to `*` for simplicity; lock it to your domain in production if you prefer.
