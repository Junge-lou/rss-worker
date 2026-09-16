import { renderRss2 } from '../../../utils/util';
import { getItemFromDynamic } from './card.mjs';
import { getDynSpaceList, matchCache, putCache } from './feed_cache.mjs';

let deal = async (ctx) => {
	const { uid } = ctx.req.param();
	// 可选：wrangler secret put BILI_ACCESS_KEY 后自动携带 App 登录态，降低风控概率；不设置则匿名访问
	let dynSpaceList = await getDynSpaceList(uid, ctx.env.BILI_ACCESS_KEY || '');
	// 上游偶发返回空列表：回退到最近一次成功的内容，避免阅读器订阅/刷新拿到空 feed
	if (dynSpaceList.length === 0) {
		const cached = await matchCache(ctx);
		if (cached) {
			ctx.header('x-feed-cache', 'hit');
			return ctx.body(await cached.text());
		}
	}
	let items = [];
	let globalUsername = '';
	if (dynSpaceList.length !== 0) {
		globalUsername = dynSpaceList[0].extend.origName;
	} else {
		globalUsername = uid;
	}
	for (let card of dynSpaceList) {
		let item = getItemFromDynamic(card);
		items.push(item);
	}

	let data = {
		title: `${globalUsername} 的 bilibili 动态`,
		link: `https://space.bilibili.com/${uid}/dynamic`,
		description: `${globalUsername} 的 bilibili 动态`,
		language: 'zh-cn',
		// category: 'bilibili',
		items: items,
	};
	let rss = renderRss2(data);
	ctx.header('Content-Type', 'application/xml');
	if (dynSpaceList.length !== 0) {
		await putCache(ctx, `${rss}`);
	}
	return ctx.body(`${rss}`);
};

let setup = (route) => {
	route.get('/bilibili/user/dynamic/:uid', deal);
};

export default { setup };
export { getItemFromDynamic };
