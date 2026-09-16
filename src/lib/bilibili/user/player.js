import { buildMpd, playerPageHtml, fallbackPageHtml } from '../player_utils.mjs';

const BROWSER_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 自建播放器页：阅读器的 iframe 加载本页时，服务端用 BILI_COOKIE 现调 playurl 拿大会员档 DASH 流，
// 以 dash.js(MSE) 合成播放。流地址只在观看时刻生成，天然不受 CDN 签名时效影响。
let deal = async (ctx) => {
	const bvid = ctx.req.param('bvid');
	const autoplay = ctx.req.query('autoplay') === '1';
	const origin = new URL(ctx.req.url).origin;
	const cookie = ctx.env.BILI_COOKIE || '';

	if (!/^BV[0-9A-Za-z]{8,12}$/.test(bvid)) {
		return ctx.text('invalid bvid', 400);
	}

	try {
		if (!cookie) {
			throw new Error('未配置 BILI_COOKIE');
		}

		let cid = ctx.req.query('cid');
		if (!cid || !/^\d+$/.test(cid)) {
			const view = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
				headers: { 'User-Agent': BROWSER_UA },
			}).then((r) => r.json());
			if (view.code !== 0 || !view.data?.cid) {
				throw new Error(`获取 cid 失败：${view.code}`);
			}
			cid = view.data.cid;
		}

		const playurlRes = await fetch(
			`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=120&fnval=4048&fourk=1`,
			{
				headers: {
					'User-Agent': BROWSER_UA,
					Referer: 'https://www.bilibili.com/',
					Cookie: cookie,
				},
			},
		).then((r) => r.json());

		if (playurlRes.code !== 0 || !playurlRes.data?.dash) {
			throw new Error(`playurl ${playurlRes.code}（无 DASH 或 Cookie 失效）`);
		}

		const qualityLabel =
			(playurlRes.data.support_formats || []).find((f) => f.quality === playurlRes.data.quality)?.new_description ||
			`qn=${playurlRes.data.quality}`;

		const mpd = buildMpd(playurlRes.data, { origin });
		return ctx.html(playerPageHtml({ mpd, bvid, autoplay, qualityLabel }));
	} catch (e) {
		return ctx.html(fallbackPageHtml({ bvid, autoplay, note: String(e.message || e) }));
	}
};

let setup = (route) => {
	route.get('/bilibili/player/:bvid', deal);
};

export default { setup };
