import { renderRss2 } from '../../../utils/util';
import { GetDynSpace } from '../grpc_helper';
import { getItemFromDynamic } from './card.mjs';

let deal = async (ctx) => {
	const { uid } = ctx.req.param();
	let dynSpaceResJson = await GetDynSpace(uid);
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
	return ctx.body(`${rss}`);
};

let setup = (route) => {
	route.get('/bilibili/user/dynamic/:uid', deal);
};

export default { setup };
export { getItemFromDynamic };
