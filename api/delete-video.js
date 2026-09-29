// Vercel Serverless Function — 刪除 KongTalk（講圈）會員上傳嘅影片。
// Reads the scoped API token from the Vercel env var STREAM_API_TOKEN (Secret, all environments).
//   POST /api/delete-video   {uid} + x-sb-token header -> {ok:true}
// 流程：驗證 Supabase 登入 token → 查 ktalk.videos 確認該 stream_uid 屬於本人 →
//       刪除 Cloudflare Stream 影片 → 刪除 ktalk.videos 行（RLS delete policy 限本人）。
const ACCOUNT_ID = "3e9b04035114a7c5dcceaef47a347b35";
const SB_URL = "https://fksifariaiivtxsahaot.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrc2lmYXJpYWlpdnR4c2FoYW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MzUzMDEsImV4cCI6MjEwNjExMTMwMX0.oqG3o2q0TsTLj76asJl3-b3tV4v3umrPjiChBah1iNE";

// 驗證 Supabase 登入 token（冇 token／token 無效 → null）
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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  const token = process.env.STREAM_API_TOKEN;
  if (!token) {
    res.status(500).json({ ok: false, error: "STREAM_API_TOKEN not configured" });
    return;
  }
  const member = await requireMember(req);
  if (!member) {
    res.status(401).json({ ok: false, error: "請先登入先可以刪除影片" });
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

  const base = "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT_ID + "/stream";
  const sbh = {
    apikey: SB_ANON,
    Authorization: "Bearer " + req.headers["x-sb-token"],
    "Content-Type": "application/json"
  };

  try {
    // 1) 查 ktalk.videos，確認呢條片係本人上傳
    const q = await fetch(
      SB_URL + "/rest/v1/videos?stream_uid=eq." + encodeURIComponent(uid) + "&select=user_id",
      { headers: sbh }
    );
    const rows = await q.json().catch(() => []);
    const row = rows && rows[0];
    if (!row || row.user_id !== member.id) {
      res.status(403).json({ ok: false, error: "搵唔到呢條片，或者唔係你上傳嘅" });
      return;
    }

    // 2) 刪除 Cloudflare Stream 影片（404 = 雲端已經冇咗，照當成功繼續清 DB）
    const dr = await fetch(base + "/" + encodeURIComponent(uid), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token }
    });
    if (!dr.ok && dr.status !== 404) {
      res.status(502).json({ ok: false, error: "刪除雲端影片失敗，請再試" });
      return;
    }

    // 3) 刪除 ktalk.videos 行（靠 RLS delete policy：只可以刪自己嘅）
    await fetch(
      SB_URL + "/rest/v1/videos?stream_uid=eq." + encodeURIComponent(uid),
      { method: "DELETE", headers: sbh }
    );

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "internal error" });
  }
};
