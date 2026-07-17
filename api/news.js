// api/news.js — pulls live headlines from Google News RSS (no key, no rate limit, always fresh)
// and reshapes them into the same {articles:[{title,url,publishedAt,source:{name}}]} shape the
// app already expects, so nothing on the app side needs to change.

export default async function handler(req, res) {
  const q = ((req.query && req.query.q) || 'golf');
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

  let xml;
  try {
    const r = await fetch(url);
    xml = await r.text();
  } catch (e) {
    res.status(502).json({ error: 'news_unreachable' });
    return;
  }

  const articles = [];
  const items = xml.split('<item>').slice(1);
  for (const chunk of items.slice(0, 12)) {
    const get = (tag) => {
      const m = chunk.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].replace('<![CDATA[', '').replace(']]>', '').trim() : '';
    };
    let title = get('title');
    let source = '';
    // Google News titles are usually "Headline - Source Name"
    const dash = title.lastIndexOf(' - ');
    if (dash !== -1) { source = title.slice(dash + 3).trim(); title = title.slice(0, dash).trim(); }
    const link = get('link');
    const pubDate = get('pubDate');
    if (!title || !link) continue;
    articles.push({
      title,
      url: link,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      source: { name: source || 'Google News' },
    });
  }

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=450');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ articles });
}
