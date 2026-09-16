import { GetPlayUrl, GetViewAidCid } from '../grpc_helper';
import { buildMpd, playerPageHtml, fallbackPageHtml } from '../player_utils.mjs';

// 自建播放器页：阅读器的 iframe 加载本页时，服务端通过 gRPC（BILI_ACCESS_KEY 认证，可解锁大会员档位）
// 现调 PlayURL 拿 DASH 流，以 dash.js(MSE) 合成播放。流地址只在观看时刻生成，不受 CDN 签名时效影响。
// 注意：网页 API（api.bilibili.com）在 Cloudflare 机房 IP 上会被风控返回 HTML，因此这里全部走 gRPC。
let deal = async (ctx) => {
	const bvid = ctx.req.param('bvid');
	const autoplay = ctx.req.query('autoplay') === '1';
	const origin = new URL(ctx.req.url).origin;
	const accessKey = ctx.env.BILI_ACCESS_KEY || '';

	try {
		if (!/^BV[0-9A-Za-z]{8,12}$/.test(bvid)) {
			throw new Error('invalid bvid');
		}

		// PlayURL 对 aid 有校验，始终先过 View 接口拿 aid/cid；View 失败才退回查询参数
		let aid = 0;
		let cid = ctx.req.query('cid');
		try {
			const view = await GetViewAidCid(bvid, accessKey);
			if (view.aid) aid = Number(view.aid);
			if (view.cid) cid = view.cid;
		} catch (e) {
			console.log(`[player] view 失败，退回查询参数: ${e.message}`);
		}
		if (!cid) {
			throw new Error('无法获取 cid');
		}

		const reply = await GetPlayUrl(aid, cid, accessKey);
		const dash = reply.dash;
		if (!dash?.video?.length) {
			throw new Error('PlayURL 未返回 DASH 流');
		}

		// Cloudflare 出口是海外 IP，B 站会把流质量钳制到 480P 且大会员权益无效；
		// 只有拿到 1080P 及以上时自建 DASH 播放才有意义，否则回落官方 iframe（走用户本机网络与登录态）。
		const bestQn = Math.max(...dash.video.map((v) => Number(v.id)));
		if (bestQn < 80) {
			throw new Error(`出口 IP 被 B 站限制为 ${bestQn}P`);
		}

		const qualityLabel = QUALITY_LABELS[String(reply.quality)] || `qn=${reply.quality}`;
		const data = {
			timelength: Number(reply.timelength || 0),
			dash: {
				video: dash.video.map((v) => ({
					id: v.id,
					bandwidth: v.bandwidth,
					codecid: v.codecid,
					frame_rate: v.frameRate || '',
					base_url: v.baseUrl,
					backup_url: v.backupUrl || [],
					segment_base: {},
				})),
				audio: (dash.audio || []).map((a) => ({
					id: a.id,
					bandwidth: a.bandwidth,
					codecid: a.codecid,
					base_url: a.baseUrl,
					backup_url: a.backupUrl || [],
					segment_base: {},
				})),
			},
		};

		const mpd = buildMpd(data, { origin });
		return ctx.html(playerPageHtml({ mpd, bvid, autoplay, qualityLabel }));
	} catch (e) {
		return ctx.html(fallbackPageHtml({ bvid, autoplay, note: String(e.message || e) }));
	}
};

const QUALITY_LABELS = {
	127: '超清 8K',
	126: '杜比视界',
	125: 'HDR 真彩',
	120: '超清 4K',
	116: '高清 1080P60',
	112: '高清 1080P+',
	80: '高清 1080P',
	74: '高清 720P60',
	64: '高清 720P',
	32: '清晰 480P',
	16: '流畅 360P',
};

let setup = (route) => {
	route.get('/bilibili/player/:bvid', deal);
};

export default { setup };
