// Vercel Serverless Function — 刪除 KongTalk（講圈）會員帳號。
// Reads the scoped API token from the Vercel env var STREAM_API_TOKEN (Secret, all environments).
//   POST /api/delete-account   {password} + x-sb-token header -> {ok:true}
// 流程：驗證 Supabase 登入 token → 用密碼再確認身份 →
//       刪除該用戶所有 Cloudflare Stream 影片 →
//       刪除 ktalk.videos / articles / follows / profiles 中該用戶數據 →
//       刪除 ktalk-images bucket 中該用戶圖片。
// 注意：Supabase auth.users 本體需 service_role 先刪得，呢度只清數據；
//       用戶登出後個空 auth 帳號無害，再登入會當新用戶起返 profile。
const ACCOUNT_ID = "3e9b04035114a7c5dcceaef47a347b35";
const SB_URL = "https://fksifariaiivtxsahaot.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrc2lmYXJpYWlpdnR4c2FoYW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MzUzMDEsImV4cCI6MjEwNjExMTMwMX0.oqG3o2q0TsTLj76asJl3-b3tV4v3umrPjiChBah1iNE";

async function sbFetch(path, token, opts) {
  opts = opts || {};
  const headers = {
    apikey: SB_ANON,
    Authorization: "Bearer " + token,
    "Content-Type": "application/json"
  };
  if (opts.profile) {
    headers["Accept-Profile"] = opts.profile;
    headers["Content-Profile"] = opts.profile;
  }
  const r = await fetch(SB_URL + path, {
    method: opts.method || "GET",
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  return r;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  const streamToken = process.env.STREAM_API_TOKEN;
  if (!streamToken) {
    res.status(500).json({ ok: false, error: "STREAM_API_TOKEN not configured" });
    return;
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const password = String(body.password || "");
  if (!password) {
    res.status(400).json({ ok: false, error: "請輸入密碼確認" });
    return;
  }

  // 1. 驗證登入 token
  const tok = req.headers["x-sb-token"] || "";
  if (!tok) {
    res.status(401).json({ ok: false, error: "請先登入" });
    return;
  }
  let user = null;
  try {
    const r = await fetch(SB_URL + "/auth/v1/user", {
      headers: { apikey: SB_ANON, Authorization: "Bearer " + tok }
    });
    if (!r.ok) {
      res.status(401).json({ ok: false, error: "登入已過期，請重新登入" });
      return;
    }
    user = await r.json().catch(() => null);
  } catch (e) {
    res.status(500).json({ ok: false, error: "驗證失敗" });
    return;
  }
  if (!user || !user.id || !user.email) {
    res.status(401).json({ ok: false, error: "登入已過期，請重新登入" });
    return;
  }
  const uid = user.id;

  // 2. 用密碼再確認身份（防止別人用部機亂刪）
  try {
    const r = await fetch(SB_URL + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: SB_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: password })
    });
    if (!r.ok) {
      res.status(403).json({ ok: false, error: "密碼唔啱，取消刪除" });
      return;
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: "密碼驗證失敗" });
    return;
  }

  const errors = [];

  // 3. 攞該用戶所有 stream_uid，逐個刪 Stream 原片
  let streamUids = [];
  try {
    const r = await sbFetch("/rest/v1/videos?user_id=eq." + uid + "&select=stream_uid", tok, { profile: "ktalk" });
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      streamUids = rows.map(function (x) { return x.stream_uid; }).filter(Boolean);
    }
  } catch (e) { errors.push("讀取影片列表失敗"); }

  const streamBase = "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT_ID + "/stream";
  for (const sUid of streamUids) {
    try {
      await fetch(streamBase + "/" + sUid, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + streamToken }
      });
    } catch (e) { errors.push("Stream 刪片失敗:" + sUid.slice(0, 8)); }
  }

  // 4. 刪 DB 數據（用 RLS，本人刪本人）
  const dels = [
    ["/rest/v1/videos?user_id=eq." + uid, "影片記錄"],
    ["/rest/v1/articles?user_id=eq." + uid, "文章"],
    ["/rest/v1/follows?follower_id=eq." + uid, "關注"],
    ["/rest/v1/follows?following_id=eq." + uid, "粉絲"],
    ["/rest/v1/profiles?id=eq." + uid, "個人資料"]
  ];
  for (const [path, label] of dels) {
    try {
      const r = await sbFetch(path, tok, { method: "DELETE", profile: "ktalk" });
      if (!r.ok) errors.push(label + "刪除失敗");
    } catch (e) { errors.push(label + "刪除失敗"); }
  }

  // 5. 刪該用戶喺 ktalk-images 嘅圖片
  try {
    const r = await sbFetch("/storage/v1/object/list/ktalk-images", tok, {
      method: "POST",
      body: { prefix: uid + "/", limit: 100 }
    });
    if (r.ok) {
      const files = await r.json().catch(() => []);
      for (const f of files) {
        if (!f.name) continue;
        try {
          await fetch(SB_URL + "/storage/v1/object/ktalk-images/" + uid + "/" + f.name, {
            method: "DELETE",
            headers: { apikey: SB_ANON, Authorization: "Bearer " + tok }
          });
        } catch (e) {}
      }
    }
  } catch (e) {}

  // 6. 徹底刪除 auth 用戶（需 SUPABASE_SERVICE_KEY）
  let authDeleted = false;
  const svcKey = process.env.SUPABASE_SERVICE_KEY;
  if (svcKey) {
    try {
      const r = await fetch(SB_URL + "/auth/v1/admin/users/" + uid, {
        method: "DELETE",
        headers: { apikey: svcKey, Authorization: "Bearer " + svcKey }
      });
      authDeleted = r.ok;
      if (!r.ok) errors.push("登入帳號刪除失敗");
    } catch (e) { errors.push("登入帳號刪除失敗"); }
  }

  res.status(200).json({ ok: true, deletedVideos: streamUids.length, authDeleted: authDeleted, errors: errors });
};
