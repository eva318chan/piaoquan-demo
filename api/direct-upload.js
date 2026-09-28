// Vercel Serverless Function — Cloudflare Stream direct upload for KongTalk (講圈).
// Reads the scoped API token from the Vercel env var STREAM_API_TOKEN (Secret, all environments).
//   POST /api/direct-upload   {title} + x-sb-token header -> {ok, uploadURL, uid}   (create one-time direct upload URL; 會員先用到)
//   GET  /api/direct-upload?uid=<uid> -> {ok, uid, ready, duration} (poll transcode status)
const ACCOUNT_ID = "3e9b04035114a7c5dcceaef47a347b35";
const SB_URL = "https://fksifariaiivtxsahaot.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrc2lmYXJpYWlpdnR4c2FoYW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MzUzMDEsImV4cCI6MjEwNjExMTMwMX0.oqG3o2q0TsTLj76asJl3-b3tV4v3umrPjiChBah1iNE";

// 驗證 Supabase 登入 token（冇 token／token 無效 → 401）
async function requireMember(req) {
  const tok = req.headers["x-sb-token"] || "";
  if (!tok) return null;
  try {
    const r = await fetch(SB_URL + "/auth/v1/user", {
      headers: { apikey: SB_ANON, Authorization: "Bearer " + tok }
    });
    if (!r.ok) return null;
    const u = await r.json().catch(() => null);
    return u && u.id ? u : null;
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  const token = process.env.STREAM_API_TOKEN;
  if (!token) {
    res.status(500).json({ ok: false, error: "STREAM_API_TOKEN not configured" });
    return;
  }
  const base = "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT_ID + "/stream";

  try {
    if (req.method === "POST") {
      const member = await requireMember(req);
      if (!member) {
        res.status(401).json({ ok: false, error: "請先登入或註冊講圈帳號先可以上傳" });
        return;
      }
      let body = req.body || {};
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      const title = String(body.title || "講圈短片").slice(0, 120);
      const r = await fetch(base + "/direct_upload", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          maxDurationSeconds: 600,
          meta: { name: title }
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) {
        const msg = (data.errors && data.errors[0] && data.errors[0].message) || "Stream direct_upload failed";
        res.status(502).json({ ok: false, error: msg });
        return;
      }
      res.status(200).json({ ok: true, uploadURL: data.result.uploadURL, uid: data.result.uid });
      return;
    }

    if (req.method === "GET") {
      const uid = (req.query && req.query.uid) || "";
      if (!uid) {
        res.status(400).json({ ok: false, error: "missing uid" });
        return;
      }
      const r = await fetch(base + "/" + encodeURIComponent(uid), {
        headers: { Authorization: "Bearer " + token }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) {
        res.status(502).json({ ok: false, error: "Stream lookup failed" });
        return;
      }
      const ready = !!data.result.readyToStream;
      // 影片 ready 後自動開 MP4 下載（idempotent），令 Facebook 分享可以內嵌播放條片
      if (ready) {
        try {
          await fetch(base + "/" + encodeURIComponent(uid) + "/downloads", {
            method: "POST",
            headers: { Authorization: "Bearer " + token }
          });
        } catch (e) { /* 開唔到都唔阻住 status 回傳 */ }
      }
      res.status(200).json({
        ok: true,
        uid: data.result.uid,
        ready: ready,
        duration: data.result.duration
      });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ ok: false, error: "method not allowed" });
  } catch (e) {
    res.status(500).json({ ok: false, error: "internal error" });
  }
};
