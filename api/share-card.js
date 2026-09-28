// Vercel Serverless Function — 每條短片嘅獨立分享卡片（講圈 KongTalk）。
// 微信 / WhatsApp / Facebook 嘅爬蟲會讀呢頁嘅 og 標籤，顯示「標題＋影片縮圖」卡片；
// 真人撳入嚟會即刻跳轉去主站 ktalk.hk。
//   GET /api/share-card?t=<標題>&img=<縮圖URL>&p=<播放數>
module.exports = (req, res) => {
  var q = req.query || {};
  var t = String(q.t || "講圈短片").slice(0, 60);
  var img = String(q.img || "");
  var p = String(q.p || "").slice(0, 30);
  // 只接受 http(s) 圖片，防 XSS / open redirect
  if (!/^https:\/\//i.test(img)) img = "https://picsum.photos/seed/kongtalk/800/450";
  var esc = function (s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };
  var desc = "記錄港生活，分享港味道。" + (p ? "（" + p + "）" : "");
  var html =
    '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    "<title>" + esc(t) + " · 講圈</title>" +
    '<meta property="og:type" content="website">' +
    '<meta property="og:site_name" content="講圈 KongTalk">' +
    '<meta property="og:title" content="' + esc(t) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:image" content="' + esc(img) + '">' +
    '<meta property="og:url" content="https://ktalk.hk/">' +
    '<meta http-equiv="refresh" content="0;url=https://ktalk.hk/">' +
    "</head><body>" +
    '<p style="font-family:sans-serif;text-align:center;padding:40px">正在前往講圈… <a href="https://ktalk.hk/">按此</a></p>' +
    '<script>location.replace("https://ktalk.hk/");</script>' +
    "</body></html>";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(html);
};
