// Vercel Serverless Function — Cloudflare Stream direct upload for KongTalk (講圈).
// Reads the scoped API token from the Vercel env var STREAM_API_TOKEN (Secret, all environments).
//   POST /api/direct-upload   {title} -> {ok, uploadURL, uid}   (create one-time direct upload URL)
//   GET  /api/direct-upload?uid=<uid> -> {ok, uid, ready, duration} (poll transcode status)
const ACCOUNT_ID = "3e9b04035114a7c5dcceaef47a347b35";

module.exports = async (req, res) => {
  const token = process.env.STREAM_API_TOKEN;
  if (!token) {
    res.status(500).json({ ok: false, error: "STREAM_API_TOKEN not configured" });
    return;
  }
  const base = "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT_ID + "/stream";

  try {
    if (req.method === "POST") {
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
