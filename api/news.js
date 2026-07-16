// api/news.js — proxies GNews.io so the key stays server-side and the app avoids
// browser CORS issues. Set NEWS_API_KEY in Vercel → Project → Environment Variables.

const KEY = process.env.NEWS_API_KEY;

export default async function handler(req, res) {
  if (!KEY) { res.status(200).json({ articles: [] }); return; }
  const q = (req.query && req.query.q) || 'golf';
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=10&apikey=${KEY}`;

  let raw;
  try {
    const r = await fetch(url);
    raw = await r.json();
  } catch (e) {
    res.status(502).json({ error: 'news_unreachable' });
    return;
  }

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=900');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ articles: raw.articles || [] });
}
