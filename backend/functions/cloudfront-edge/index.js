/**
 * tiktokログイン用に LambdaEdge を設定しています。
 * tiktokからトークンを取得する際、tiktokログインページからのリダイレクトが必要となりますが、SPA+S3の性質上これが基本的にはできません。
 * LambdaEdge でtiktok側からこのサイトのリダイレクトページ(/tiktok-redirect)にURLから直接アクセスできるようにします。
 * 参照1: https://qiita.com/GussieTech/items/3ae77dbcb1e79222a9bc
 * 参照2: https://github.com/CloudUnder/lambda-edge-nice-urls
 */

const indexRoutes = {
  withSlash: '/index.html',
  withoutSlash: 'index.html',
}

const regexSuffixless = /\/[^/.]+$/ // e.g. "/some/page" but not "/", "/some/" or "/some.jpg"
const regexTrailingSlash = /.+\/$/ // e.g. "/some/" or "/some/page/" but not root "/"

exports.handler = function handler (event, _, callback) {
  const { request } = event.Records[0].cf;
  const { uri } = request;
  const containsTikTokRedirect = /tiktok-redirect/i.test(uri);

  if (containsTikTokRedirect && uri.match(regexSuffixless)) {
    request.uri = uri + indexRoutes.withSlash;
    callback(null, request);
    return;
  }

  if (containsTikTokRedirect && uri.match(regexTrailingSlash)) {
    request.uri = uri + indexRoutes.withoutSlash
    callback(null, request)
    return;
  }

  callback(null, request)
}
