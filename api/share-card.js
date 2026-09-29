// Vercel Serverless Function — 每條短片嘅獨立分享卡片（講圈 KongTalk）。
// 微信 / WhatsApp / Facebook 嘅爬蟲會讀呢頁嘅 og 標籤，顯示「標題＋影片縮圖」卡片；
// 真人撳入嚟會見到 landing 頁：縮圖＋標題＋「去講圈睇片」掣，
// 若分享者開咗「分享時附上主頁連結」，會多個「睇埋我其他片」掣。
// 兩種用法：
//   短連結（新）：GET /api/share-card?v=<stream_uid>&others=1|0
//     後端自動查 ktalk.videos 攞標題同作者，縮圖同 mp4 由 uid 推算，連結好短。
//   舊參數（兼容以前分享出去嘅長連結）：GET /api/share-card?t=<標題>&img=<縮圖URL>&p=<播放數>&vsrc=<mp4>&others=1|0
const SB_URL = "https://fksifariaiivtxsahaot.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrc2lmYXJpYWlpdnR4c2FoYW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MzUzMDEsImV4cCI6MjEwNjExMTMwMX0.oqG3o2q0TsTLj76asJl3-b3tV4v3umrPjiChBah1iNE";

// 講圈號：同前端 memberPiaohao() 同一個算法（user.id → 12 位數字）
function piaohaoOf(id) {
  var h1 = 0, h2 = 0;
  for (var i = 0; i < id.length; i++) { var c = id.charCodeAt(i); h1 = ((h1 * 31) + c) >>> 0; h2 = ((h2 * 37) + c + i) >>> 0; }
  return (String(h1).padStart(10, "0") + String(h2).padStart(10, "0")).slice(0, 12);
}

module.exports = async (req, res) => {
  var q = req.query || {};
  var others = String(q.others === undefined ? "1" : q.others) !== "0";
  var uid = /^[a-f0-9]{32}$/i.test(String(q.v || "")) ? String(q.v) : "";

  var t = String(q.t || "講圈短片").slice(0, 60);
  var img = String(q.img || "");
  var p = String(q.p || "").slice(0, 30);
  var vsrc = String(q.vsrc || "");
  var ownerPiao = "84a113104747"; // demo 影片 fallback

  if (uid) {
    // 短連結模式：後端查片，唔使將所有參數塞入 URL
    try {
      var r = await fetch(SB_URL + "/rest/v1/videos?stream_uid=eq." + uid + "&select=title,user_id&limit=1", {
        headers: { apikey: SB_ANON, "Accept-Profile": "ktalk" }
      });
      var rows = await r.json();
      if (rows && rows.length) {
        if (rows[0].title) t = String(rows[0].title).slice(0, 60);
        if (rows[0].user_id) ownerPiao = piaohaoOf(String(rows[0].user_id));
      }
    } catch (e) { /* 查唔到就用參數/fallback，卡照出 */ }
    img = "https://videodelivery.net/" + uid + "/thumbnails/thumbnail.jpg";
    vsrc = "https://videodelivery.net/" + uid + "/downloads/default.mp4";
  }
  // 直接 mp4 連結（有先會加 og:video，Facebook 先會內嵌播放條片）
  if (!/^https:\/\//i.test(vsrc)) vsrc = "";
  // 只接受 https 圖片，防 XSS / open redirect
  if (!/^https:\/\//i.test(img)) img = "https://picsum.photos/seed/kongtalk/800/450";
  var esc = function (s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };
  var desc = "記錄港生活，分享港味道。" + (p ? "（" + p + "）" : "");
  var ogtype = vsrc ? "video.other" : "website";
  var ogvideo = vsrc
    ? '<meta property="og:video" content="' + esc(vsrc) + '">' +
      '<meta property="og:video:secure_url" content="' + esc(vsrc) + '">' +
      '<meta property="og:video:type" content="video/mp4">' +
      '<meta property="og:video:width" content="400">' +
      '<meta property="og:video:height" content="700">'
    : "";
  var deeplink = uid ? "https://ktalk.hk/#v=" + uid : "https://ktalk.hk/#v=" + encodeURIComponent(t);
  var btn =
    '<a href="' + deeplink + '" style="display:block;text-align:center;background:#07c160;color:#fff;' +
    'border-radius:28px;padding:14px;margin-top:18px;text-decoration:none;font-size:16px;font-weight:700">▶ 去講圈睇呢條片</a>';
  if (others) {
    btn +=
      '<a href="https://ktalk.hk/#u=' + ownerPiao + '" style="display:block;text-align:center;background:#fff;color:#07c160;' +
      'border:1px solid #07c160;border-radius:28px;padding:14px;margin-top:12px;text-decoration:none;font-size:16px;font-weight:700">睇埋我其他片</a>';
  }
  var html =
    '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>" + esc(t) + " · 講圈</title>" +
    '<meta property="og:type" content="' + ogtype + '">' +
    ogvideo +
    '<meta property="og:site_name" content="講圈 KongTalk">' +
    '<meta property="og:title" content="' + esc(t) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:image" content="' + esc(img) + '">' +
    '<meta property="og:url" content="https://ktalk.hk/">' +
    "</head>" +
    '<body style="margin:0;font-family:-apple-system,\'PingFang HK\',\'Microsoft JhengHei\',sans-serif;background:#f0f0f0">' +
    '<div style="max-width:480px;margin:0 auto;background:#fff;min-height:100vh">' +
    '<div style="padding:14px 18px;font-weight:800;font-size:18px">講圈 ' +
    '<span style="font-weight:400;font-size:13px;color:#888">香港人講嘢嘅短片平台</span></div>' +
    '<img src="' + esc(img) + '" style="width:100%;display:block" alt="">' +
    '<div style="padding:16px 18px 30px">' +
    '<div style="font-size:17px;font-weight:700">' + esc(t) + "</div>" +
    '<div style="color:#888;font-size:13px;margin-top:6px">' + esc(desc) + "</div>" +
    btn +
    "</div></div></body></html>";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(html);
};
