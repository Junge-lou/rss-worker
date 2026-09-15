import { getItemFromDynamic } from './dynamic.js';
import { renderRss2 } from '../../../utils/util';
import { GetDynSpace } from '../grpc_helper';

let deal = async (ctx) => {
	const { uid } = ctx.req.param();
	// 可选：wrangler secret put BILI_ACCESS_KEY 后自动携带 App 登录态，降低风控概率；不设置则匿名访问
	let dynSpaceResJson = await GetDynSpace(uid, ctx.env.BILI_ACCESS_KEY || '');
	let dynSpaceRes = JSON.parse(dynSpaceResJson);
	let dynSpaceList = Array.isArray(dynSpaceRes.list) ? dynSpaceRes.list : [];
	let items = [];
	let globalUsername = '';
	if (dynSpaceList.length !== 0) {
		globalUsername = dynSpaceList[0].extend.origName;
	} else {
		globalUsername = uid;
	}
	for (let card of dynSpaceList) {
		if (card.cardType !== 'av') {
			continue;
		}
		let item = getItemFromDynamic(card);
		items.push(item);
	}

	let data = {
		title: `${globalUsername} 的 bilibili 视频`,
		link: `https://space.bilibili.com/${uid}/video`,
		description: `${globalUsername} 的 bilibili 视频`,
		language: 'zh-cn',
		// category: 'bilibili',
		items: items,
	};
	let rss = renderRss2(data);
	ctx.header('Content-Type', 'application/xml');
	return ctx.body(`${rss}`);
};

let setup = (route) => {
	route.get('/bilibili/user/video/:uid', deal);
};

export default { setup };
