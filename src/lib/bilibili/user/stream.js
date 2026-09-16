import { isAllowedStreamHost, fromBase64Url } from '../player_utils.mjs';

const BROWSER_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 流代理：B 站 CDN 校验 Referer 且不发 CORS 头，浏览器里的 dash.js 无法直连，
// 因此由 worker 代替播放器请求流（带 bilibili Referer），并透传 Range 实现拖动进度条。
let deal = async (ctx) => {
	const u = ctx.req.query('u');
	let target;
	try {
		target = fromBase64Url(u || '');
	} catch {
		return ctx.text('bad u', 400);
	}

	let parsed;
	try {
		parsed = new URL(target);
	} catch {
		return ctx.text('bad url', 400);
	}
	if (parsed.protocol !== 'https:' || !isAllowedStreamHost(parsed.hostname)) {
		return ctx.text('host not allowed', 403);
	}

	const headers = {
		'User-Agent': BROWSER_UA,
		Referer: 'https://www.bilibili.com/',
	};
	const range = ctx.req.header('range');
	if (range) {
		headers.Range = range;
	}

	const upstream = await fetch(parsed.href, { headers });
	const out = {};
	for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
		const v = upstream.headers.get(h);
		if (v) {
			out[h] = v;
		}
	}
	return ctx.body(upstream.body, upstream.status, out);
};

let setup = (route) => {
	route.get('/bilibili/stream', deal);
};

export default { setup };
