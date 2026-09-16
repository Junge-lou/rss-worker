// 兼容路由：旧缓存条目的 iframe 曾指向本自建播放器页，阅读器会长期缓存旧条目，故路由不能删除。
// 现在播放一律直连官方播放器（不经 workers.dev 中转——部分网络无法访问 workers.dev，中转会导致无画面），
// 本路由只把旧地址 302 到同参数的官方播放器，避免缓存条目 404/无画面。
let deal = (ctx) => {
	const bvid = ctx.req.param('bvid');
	if (!/^BV[0-9A-Za-z]{8,12}$/.test(bvid)) {
		return ctx.text('invalid bvid', 400);
	}
	const params = new URLSearchParams({
		bvid,
		page: '1',
		high_quality: '1',
		danmaku: '0',
		autoplay: ctx.req.query('autoplay') === '1' ? '1' : '0',
	});
	const cid = ctx.req.query('cid');
	if (cid && /^\d+$/.test(cid)) {
		params.set('cid', cid);
	}
	return ctx.redirect(`https://player.bilibili.com/player.html?${params.toString()}`);
};

let setup = (route) => {
	route.get('/bilibili/player/:bvid', deal);
};

export default { setup };
