// Vercel Serverless Function — 影片播放計數 +1。
//   POST /api/bump-play   {uid} -> {ok:true}
// 經 SECURITY DEFINER function ktalk.bump_play 只加 plays 欄，唔使開 UPDATE policy。
const SB_URL = "https://fksifariaiivtxsahaot.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrc2lmYXJpYWlpdnR4c2FoYW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MzUzMDEsImV4cCI6MjEwNjExMTMwMX0.oqG3o2q0TsTLj76asJl3-b3tV4v3umrPjiChBah1iNE";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const uid = String(body.uid || "").trim();
  if (!uid) {
    res.status(400).json({ ok: false, error: "missing uid" });
    return;
  }
  try {
    const r = await fetch(SB_URL + "/rest/v1/rpc/bump_play", {
      method: "POST",
      headers: {
        apikey: SB_ANON,
        Authorization: "Bearer " + SB_ANON,
        "Content-Type": "application/json",
        "Accept-Profile": "ktalk",
        "Content-Profile": "ktalk"
      },
      body: JSON.stringify({ p_uid: uid })
    });
    if (!r.ok) {
      const t = await r.text().catch(function(){ return ""; });
      res.status(502).json({ ok: false, error: "bump failed" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "bump failed" });
  }
};
