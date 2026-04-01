// api/scores.js — Vercel Serverless Function
// This runs on the SERVER. The API key is never sent to the browser.
// Deploy to Vercel, set CRICAPI_KEY in Environment Variables.

export default async function handler(req, res) {
  // Allow your site to call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const key = process.env.CRICAPI_KEY;
  if (!key) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  try {
    const [currentRes, upcomingRes] = await Promise.all([
      fetch(`https://api.cricapi.com/v1/currentMatches?apikey=${key}&offset=0`),
      fetch(`https://api.cricapi.com/v1/matches?apikey=${key}&offset=0`),
    ]);

    const current  = await currentRes.json();
    const upcoming = await upcomingRes.json();

    // Normalise into a clean shape — frontend gets no raw API details
    const toCard = (m) => ({
      id:        m.id,
      series:    m.name || m.matchType || 'Cricket Match',
      isLive:    m.matchStarted && !m.matchEnded,
      isUpcoming:!m.matchStarted,
      isCompleted: m.matchEnded,
      isIPL:     (m.name || '').toLowerCase().includes('ipl'),
      teams: (m.teams || ['Team A', 'Team B']).map((name, i) => {
        const s = m.score?.[i];
        return {
          name,
          score: s ? `${s.r}/${s.w}` : (m.matchStarted ? '—' : 'TBD'),
          overs: s ? String(s.o) : '',
        };
      }),
      status:    m.status || (m.matchStarted ? 'In progress' : 'Scheduled'),
      venue:     m.venue || '',
      date:      m.dateTimeGMT || '',
    });

    const liveAndRecent = (current.data  || []).map(toCard);
    const upcomingCards = (upcoming.data || [])
      .filter(m => !m.matchStarted)
      .slice(0, 6)
      .map(toCard);

    // Deduplicate
    const seen = new Set(liveAndRecent.map(m => m.id));
    const deduped = [
      ...liveAndRecent,
      ...upcomingCards.filter(m => !seen.has(m.id)),
    ];

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ matches: deduped, source: 'cricapi', ts: Date.now() });

  } catch (err) {
    return res.status(502).json({ error: 'Upstream fetch failed', detail: err.message });
  }
}
