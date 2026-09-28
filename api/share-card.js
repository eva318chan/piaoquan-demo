// Vercel Serverless Function — 每條短片嘅獨立分享卡片（講圈 KongTalk）。
// 微信 / WhatsApp / Facebook 嘅爬蟲會讀呢頁嘅 og 標籤，顯示「標題＋影片縮圖」卡片；
// 真人撳入嚟會見到 landing 頁：縮圖＋標題＋「去講圈睇片」掣，
// 若分享者開咗「分享時附上主頁連結」，會多個「睇埋我其他片」掣。
//   GET /api/share-card?t=<標題>&img=<縮圖URL>&p=<播放數>&others=1|0
module.exports = (req, res) => {
  var q = req.query || {};
  var t = String(q.t || "講圈短片").slice(0, 60);
  var img = String(q.img || "");
  var p = String(q.p || "").slice(0, 30);
  var others = String(q.others === undefined ? "1" : q.others) !== "0";
  // 直接 mp4 連結（有先會加 og:video，Facebook 先會內嵌播放條片）
  var vsrc = String(q.vsrc || "");
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
  var deeplink = "https://ktalk.hk/#v=" + encodeURIComponent(t);
  var btn =
    '<a href="' + deeplink + '" style="display:block;text-align:center;background:#07c160;color:#fff;' +
    'border-radius:28px;padding:14px;margin-top:18px;text-decoration:none;font-size:16px;font-weight:700">▶ 去講圈睇呢條片</a>';
  if (others) {
    btn +=
      '<a href="https://ktalk.hk/#u=84a113104747" style="display:block;text-align:center;background:#fff;color:#07c160;' +
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
