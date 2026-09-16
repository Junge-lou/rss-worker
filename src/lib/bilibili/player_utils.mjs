// B 站自建播放器页的纯函数集合：MPD 构建、流代理 URL、域名白名单。
// 不依赖 Workers 运行时 API（仅用 btoa/atob 全局，Node 16+ 亦可用），便于单元测试。

// 流代理只允许 B 站自家 CDN，防止被当成开放代理
const STREAM_HOST_SUFFIXES = ['bilivideo.com', 'bilivideo.cn', 'akamaized.net'];

let isAllowedStreamHost = (hostname) => {
	const h = (hostname || '').toLowerCase();
	return STREAM_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith('.' + suffix));
};

let toBase64Url = (str) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let fromBase64Url = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

let toProxyUrl = (url, origin) => `${origin}/rss/bilibili/stream?u=${toBase64Url(url)}`;

let escXml = (s) =>
	String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// B 站 codecid → MSE 兼容的 codecs 字符串（gRPC DashItem 只带数字 codecid；字符串为常用档，浏览器会从流中嗅探真实参数）
const CODEC_BY_CODECID = { 7: 'avc1.640032', 12: 'hvc1.1.6.L123.00', 13: 'av01.0.08M.08' };

const CODEC_PREFERENCE = (r) => {
	const c = r.codecs || CODEC_BY_CODECID[r.codecid] || '';
	return c.startsWith('avc1') ? 3 : c.startsWith('hev1') || c.startsWith('hvc1') ? 2 : c.startsWith('av01') ? 1 : 0;
};

// 由 playurl(fnval=16) 的 data 构造极简 MPD：
// - 视频轨按清晰度去重、编解码优先 avc1，清晰度从高到低
// - 音频轨全部保留，按码率从高到低
// - 所有流地址改写为 worker 流代理（解决 CDN 的 Referer/CORS 限制）
let buildMpd = (data, { origin }) => {
	const dash = data.dash || {};
	const durationSec = (data.timelength || 0) / 1000;
	const duration = `PT${durationSec.toFixed(3)}S`;

	const byQuality = new Map();
	for (const v of dash.video || []) {
		const prev = byQuality.get(v.id);
		if (!prev || CODEC_PREFERENCE(v) > CODEC_PREFERENCE(prev)) {
			byQuality.set(v.id, v);
		}
	}
	const videos = [...byQuality.values()].sort((a, b) => b.id - a.id);
	const audios = [...(dash.audio || [])].sort((a, b) => b.bandwidth - a.bandwidth);

	const repXml = (r, kind) => {
		const sb = r.segment_base || r.segmentBase || {};
		const init = sb.initialization || '';
		const idx = sb.index_range || sb.indexRange || '';
		const seg = init && idx ? `<SegmentBase indexRange="${escXml(idx)}"><Initialization range="${escXml(init)}"/></SegmentBase>` : '';
		const size =
			kind === 'video'
				? ` width="${r.width || 0}" height="${r.height || 0}"${r.frame_rate ? ` frameRate="${escXml(r.frame_rate)}"` : ''}`
				: '';
		const codecs = r.codecs || CODEC_BY_CODECID[r.codecid] || '';
		const backups = (r.backup_url || []).map((b) => `<BaseURL>${escXml(toProxyUrl(b, origin))}</BaseURL>`).join('');
		return `<Representation id="${kind}${r.id}" bandwidth="${r.bandwidth || 0}" codecs="${escXml(codecs)}"${size}><BaseURL>${escXml(toProxyUrl(r.base_url, origin))}</BaseURL>${backups}${seg}</Representation>`;
	};

	const videoXml = videos.map((r) => repXml(r, 'v')).join('');
	const audioXml = audios.map((r) => repXml(r, 'a')).join('');

	return `<?xml version="1.0" encoding="UTF-8"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" mediaPresentationDuration="${duration}" minBufferTime="1.5"><Period><AdaptationSet id="0" contentType="video" mimeType="video/mp4" segmentAlignment="true" startWithSAP="1">${videoXml}</AdaptationSet><AdaptationSet id="1" contentType="audio" mimeType="audio/mp4" lang="und" segmentAlignment="true" startWithSAP="1">${audioXml}</AdaptationSet></Period></MPD>`;
};

// dash.js 的 CDN 加载链：jsdelivr 主源 → fastly 镜像 → cdnjs/bootcdn，全部失败才回落官方 iframe
const DASHJS_CDNS = [
	'https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js',
	'https://fastly.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js',
	'https://cdnjs.cloudflare.com/ajax/libs/dashjs/4.7.4/dash.all.min.js',
	'https://cdn.bootcdn.net/ajax/libs/dashjs/4.7.4/dash.all.min.js',
];

let playerPageHtml = ({ mpd, bvid, autoplay, qualityLabel }) => {
	const mpdB64 = toBase64Url(unescape(encodeURIComponent(mpd)));
	const cdnsJson = JSON.stringify(DASHJS_CDNS);
	const autoplayFlag = autoplay ? 'true' : 'false';
	const official = `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&autoplay=0`;
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escXml(bvid)}</title>
<style>
  html,body{margin:0;height:100%;background:#000;color:#eee;font:14px/1.6 system-ui,sans-serif}
  video{width:100%;height:100%;object-fit:contain}
  #msg{position:fixed;inset:auto 0 8px 0;text-align:center;color:#9ad}
  iframe{width:100%;height:100%;border:0}
</style>
</head>
<body>
<video id="v" controls playsinline preload="auto"${autoplay ? ' autoplay' : ''}></video>
<div id="msg">正在加载 ${escXml(qualityLabel || 'DASH')} …</div>
<script type="text/plain" id="mpd">${mpdB64}</script>
<script>
var CDNS = ${cdnsJson};
var MPD_B64 = document.getElementById('mpd').textContent.trim();
var FALLBACK = ${JSON.stringify(official)};
function showFallback(reason) {
  var v = document.getElementById('v');
  if (v) v.remove();
  var m = document.getElementById('msg');
  if (m) m.remove();
  var f = document.createElement('iframe');
  f.src = FALLBACK;
  f.allowfullscreen = true;
  document.body.insertBefore(f, document.body.firstChild);
  console.warn('player fallback:', reason);
}
function initPlayer() {
  try {
    var mpd = decodeURIComponent(escape(atob(MPD_B64)));
    var url = 'data:application/dash+xml;base64,' + btoa(unescape(encodeURIComponent(mpd)));
    var player = dashjs.MediaPlayer().create();
    player.updateSettings({ streaming: { buffer: { bufferTimeAtTopQuality: 20 } } });
    player.on(dashjs.MediaPlayer.events.ERROR, function (e) { showFallback(e && e.error && e.error.message || 'dash error'); });
    player.initialize(document.getElementById('v'), url, ${autoplayFlag});
    var m = document.getElementById('msg');
    if (m) setTimeout(function () { m.remove(); }, 4000);
  } catch (e) { showFallback(e && e.message); }
}
(function load(i) {
  if (i >= CDNS.length) return showFallback('all cdns failed');
  var s = document.createElement('script');
  s.src = CDNS[i];
  s.onload = function () { if (window.dashjs) initPlayer(); else load(i + 1); };
  s.onerror = function () { load(i + 1); };
  document.head.appendChild(s);
})(0);
</script>
</body>
</html>`;
};

// 未配置凭证 / playurl 失败时的兜底页：官方 iframe（游客 720P）+ 原视频页链接
let fallbackPageHtml = ({ bvid, autoplay, note }) => {
	const official = `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&autoplay=0`;
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escXml(bvid)}</title>
<style>html,body{margin:0;height:100%;background:#000;color:#ccc;font:14px/1.6 system-ui,sans-serif}iframe{width:100%;height:100%;border:0}#n{position:fixed;inset:auto 0 8px 0;text-align:center;color:#89a}</style>
</head><body>
<iframe src="${official}" allowfullscreen></iframe>
<div id="n">高画质不可用（${escXml(note || 'unknown')}），已回落官方播放器 · <a style="color:#8cf" href="https://www.bilibili.com/video/${escXml(bvid)}" target="_blank">打开视频页</a></div>
</body></html>`;
};

export { isAllowedStreamHost, toBase64Url, fromBase64Url, toProxyUrl, buildMpd, playerPageHtml, fallbackPageHtml, DASHJS_CDNS };
