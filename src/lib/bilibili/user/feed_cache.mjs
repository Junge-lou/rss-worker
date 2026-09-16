import { GetDynSpace } from '../grpc_helper';

// DynSpace gRPC 上游偶发对同一 UID 返回空列表（实测约 20%+ 概率），
// 阅读器若恰好在空响应时抓取/订阅就会失败。这里用 Cache API 保存每个 feed
// 最近一次非空结果：上游返回空时回退到缓存，让订阅永远拿得到内容。
// 只在"上游为空"时读缓存，正常抓取始终走上游，因此长 TTL 不会掩盖新数据。

const FALLBACK_TTL = 86400;

// 带一次重试的 DynSpace 拉取（空列表间隔 400ms 再试一次，避开上游抖动窗口）
let getDynSpaceList = async (uid, accessKey) => {
	const fetchList = async () => {
		const res = JSON.parse(await GetDynSpace(uid, accessKey));
		return Array.isArray(res.list) ? res.list : [];
	};
	let list = await fetchList();
	if (list.length === 0) {
		await new Promise((r) => setTimeout(r, 400));
		list = await fetchList();
	}
	return list;
};

let matchCache = async (ctx) => {
	try {
		return await caches.default.match(ctx.req.raw);
	} catch {
		return undefined;
	}
};

let putCache = async (ctx, xml) => {
	try {
		await caches.default.put(
			ctx.req.raw,
			new Response(xml, {
				headers: {
					'content-type': 'application/xml; charset=utf-8',
					'cache-control': `public, max-age=${FALLBACK_TTL}`,
				},
			}),
		);
	} catch {}
};

export { getDynSpaceList, matchCache, putCache };
