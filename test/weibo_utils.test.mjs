import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const weiboUtils = require('../src/lib/weibo/utils.js');

const makeStatus = (pics) => ({
	text: 'live photo test',
	created_at: 'Mon May 25 00:00:00 +0800 2026',
	bid: 'QAEao1yj6',
	user: {
		id: '2017083773',
		screen_name: 'tester',
		profile_image_url: 'https://example.com/avatar.jpg',
	},
	pics,
});

test('formatExtended keeps live photos in picture order', () => {
	const status = makeStatus([
		{ type: 'pic', large: { url: 'https://example.com/first.jpg' } },
		{ type: 'livephoto', large: { url: 'https://example.com/live.jpg' }, videoSrc: 'https://example.com/live.mov' },
		{ type: 'pic', large: { url: 'https://example.com/last.jpg' } },
	]);

	const { description, title } = weiboUtils.formatExtended({}, status, '2017083773');

	const firstIndex = description.indexOf('https://example.com/first.jpg');
	const livePosterIndex = description.indexOf('poster="https://example.com/live.jpg"');
	const liveVideoIndex = description.indexOf('src="https://example.com/live.mov"');
	const lastIndex = description.indexOf('https://example.com/last.jpg');

	assert.notEqual(firstIndex, -1);
	assert.notEqual(livePosterIndex, -1);
	assert.notEqual(liveVideoIndex, -1);
	assert.notEqual(lastIndex, -1);
	assert.ok(firstIndex < livePosterIndex);
	assert.ok(livePosterIndex < lastIndex);
	assert.match(title, /\[Live Photo\]/);
});

test('formatVideo does not move rendered live photos after static images', () => {
	const status = makeStatus([
		{ type: 'pic', large: { url: 'https://example.com/first.jpg' } },
		{ type: 'livephotos', large: { url: 'https://example.com/live.jpg' }, videoSrc: 'https://example.com/live.mov' },
		{ type: 'pic', large: { url: 'https://example.com/last.jpg' } },
	]);

	const { description } = weiboUtils.formatExtended({}, status, '2017083773');
	const finalDescription = weiboUtils.formatVideo(description, status);

	const firstIndex = finalDescription.indexOf('https://example.com/first.jpg');
	const liveVideoIndex = finalDescription.indexOf('src="https://example.com/live.mov"');
	const lastIndex = finalDescription.indexOf('https://example.com/last.jpg');

	assert.ok(firstIndex < liveVideoIndex);
	assert.ok(liveVideoIndex < lastIndex);
	assert.equal(finalDescription.match(/src="https:\/\/example\.com\/live\.mov"/g)?.length, 1);
});

test('formatExtended still shows a live photo poster when video source is missing', () => {
	const status = makeStatus([
		{ type: 'pic', large: { url: 'https://example.com/first.jpg' } },
		{ type: 'livephoto', large: { url: 'https://example.com/live.jpg' } },
		{ type: 'pic', large: { url: 'https://example.com/last.jpg' } },
	]);

	const { description } = weiboUtils.formatExtended({}, status, '2017083773');

	const firstIndex = description.indexOf('https://example.com/first.jpg');
	const liveIndex = description.indexOf('https://example.com/live.jpg');
	const labelIndex = description.indexOf('Live Photo');
	const lastIndex = description.indexOf('https://example.com/last.jpg');

	assert.ok(firstIndex < liveIndex);
	assert.ok(liveIndex < lastIndex);
	assert.match(description, /<img(?![^>]*hidden)[^>]*src="https:\/\/example\.com\/live\.jpg"/);
	assert.notEqual(labelIndex, -1);
});

test('apiHeaders centralizes Weibo mobile API headers', () => {
	assert.equal(weiboUtils.apiHeaders['MWeibo-Pwa'], 1);
	assert.equal(weiboUtils.apiHeaders['X-Requested-With'], 'XMLHttpRequest');
	assert.match(weiboUtils.apiHeaders['User-Agent'], /Mobile\/15A372/);
});

test('resolveMblogBid recovers empty bid from card scheme', () => {
	const card = {
		scheme: 'https://m.weibo.cn/status?mblogid=QAEao1yj6&foo=bar',
		mblog: {
			bid: '',
		},
	};

	assert.equal(weiboUtils.resolveMblogBid(card), 'QAEao1yj6');
	assert.equal(card.mblog.bid, 'QAEao1yj6');
});

test('resolveMblogBid leaves empty bid unchanged for malformed scheme', () => {
	const card = {
		scheme: '/status-without-query',
		mblog: {
			bid: '',
		},
	};

	assert.equal(weiboUtils.resolveMblogBid(card), '');
	assert.equal(card.mblog.bid, '');
});

test('resolveMblogBid recovers empty bid from relative scheme', () => {
	const card = {
		scheme: '/status?mblogid=QAEao1yj6',
		mblog: {
			bid: '',
		},
	};

	assert.equal(weiboUtils.resolveMblogBid(card), 'QAEao1yj6');
	assert.equal(card.mblog.bid, 'QAEao1yj6');
});

test('filterStalePinnedItems removes only old pinned posts', () => {
	const oldPinned = { title: 'old pinned', pubDate: new Date('2026-05-01T00:00:00Z'), isPinned: true };
	const freshPinned = { title: 'fresh pinned', pubDate: new Date('2026-05-30T00:00:00Z'), isPinned: true };
	const ordinary = { title: 'ordinary', pubDate: new Date('2026-05-20T00:00:00Z'), isPinned: false };

	assert.deepEqual(weiboUtils.filterStalePinnedItems([oldPinned, freshPinned, ordinary]), [freshPinned, ordinary]);
});

test('filterStalePinnedItems keeps original items when ordinary dates are missing', () => {
	const pinned = { title: 'pinned', pubDate: new Date('2026-05-30T00:00:00Z'), isPinned: true };
	const ordinary = { title: 'ordinary', isPinned: false };

	assert.deepEqual(weiboUtils.filterStalePinnedItems([pinned, ordinary]), [pinned, ordinary]);
});

test('normalizeCreatedAt parses absolute fallback timestamps', () => {
	const normalized = weiboUtils.normalizeCreatedAt('2026-05-30 12:34:56');

	assert.ok(normalized instanceof Date);
	assert.equal(normalized.getFullYear(), 2026);
});

test('normalizeCreatedAt returns missing and existing Date values safely', () => {
	const date = new Date('2026-05-30T00:00:00Z');

	assert.equal(weiboUtils.normalizeCreatedAt(undefined), undefined);
	assert.equal(weiboUtils.normalizeCreatedAt(null), null);
	assert.equal(weiboUtils.normalizeCreatedAt(date), date);
	assert.equal(weiboUtils.normalizeCreatedAt(1234567890), 1234567890);
});

test('formatExtended uses image geo dimensions when available', () => {
	const status = makeStatus([
		{
			type: 'pic',
			large: {
				url: 'https://example.com/sized.jpg',
				geo: {
					width: 640,
					height: 480,
				},
			},
		},
	]);

	const { description } = weiboUtils.formatExtended({}, status, '2017083773');

	assert.match(description, /<img[^>]*width="640"[^>]*height="480"[^>]*src="https:\/\/example\.com\/sized\.jpg"/);
});

test('formatExtended extracts hashtag topics as item category', () => {
	const status = makeStatus([]);
	status.text = '<span class="surl-text">#Topic One#</span> text <span class="surl-text">#第二话题#</span>';

	const { category } = weiboUtils.formatExtended({}, status, '2017083773');

	assert.equal(category, 'Topic One, 第二话题');
});

test('formatExtended marks video posts in title', () => {
	const status = makeStatus([]);
	status.page_info = { type: 'video', page_url: 'https://video.weibo.com/show?fid=1034:1' };

	const { title } = weiboUtils.formatExtended({}, status, '2017083773');

	assert.match(title, /\[视频\]/);
});

test('formatVideo falls back to error code and jump button when stream urls are missing', () => {
	const status = {
		page_info: {
			type: 'video',
			page_url: 'https://video.weibo.com/show?fid=1034:2',
		},
	};

	const description = weiboUtils.formatVideo('', status);

	assert.match(description, /HTTP 403/);
	assert.match(description, /href="https:\/\/video\.weibo\.com\/show\?fid=1034:2"/);
});

test('sinaimgTvax rewrites wx hosts inside item descriptions', () => {
	const data = {
		description: 'https://wx1.sinaimg.cn/mw2000/a.jpg',
		items: [{ description: '<img src="https://wx2.sinaimg.cn/orj480/b.jpg">' }],
	};

	const rewritten = weiboUtils.sinaimgTvax(data);

	assert.equal(rewritten.description, 'https://tvax1.sinaimg.cn/mw2000/a.jpg');
	assert.equal(rewritten.items[0].description, '<img src="https://tvax2.sinaimg.cn/orj480/b.jpg">');
});

test('sinaimgTvax keeps supporting the upstream `item` key', () => {
	const data = { item: [{ description: 'https://wx3.sinaimg.cn/c.jpg' }] };

	const rewritten = weiboUtils.sinaimgTvax(data);

	assert.equal(rewritten.item[0].description, 'https://tvax3.sinaimg.cn/c.jpg');
});

test('formatExtended shows retweet author and omits original link when bid is missing', () => {
	const status = makeStatus([]);
	status.retweeted_status = {
		created_at: 'Mon May 25 00:00:00 +0800 2026',
		user: { id: '42', screen_name: 'origin', profile_image_url: '' },
		text: 'origin text',
	};

	const { description } = weiboUtils.formatExtended({}, status, '2017083773');

	const blockquote = description.slice(description.indexOf('<blockquote'), description.indexOf('</blockquote>'));
	assert.match(blockquote, /@origin/);
	assert.ok(!description.includes('undefined'));
});

test('formatExtended links to the original weibo when retweet bid exists', () => {
	const status = makeStatus([]);
	status.retweeted_status = {
		bid: 'ABCDEF',
		created_at: 'Mon May 25 00:00:00 +0800 2026',
		user: { id: '42', screen_name: 'origin', profile_image_url: '' },
		text: 'origin text',
	};

	const { description } = weiboUtils.formatExtended({}, status, '2017083773');

	assert.match(description, /https:\/\/weibo\.com\/42\/ABCDEF/);
});

const withFetch = async (stub, run) => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = stub;
	try {
		await run();
	} finally {
		globalThis.fetch = originalFetch;
	}
};

test('getShowData returns undefined when API payload is empty', async () => {
	await withFetch(
		async () => ({ ok: true, json: async () => ({ ok: 0, data: null }) }),
		async () => {
			const ctx = { env: { WEIBO_COOKIE: 'SUB=x' } };
			assert.equal(await weiboUtils.getShowData(ctx, '123', 'ABC'), undefined);
		},
	);
});

test('apiGet throws descriptive errors for non-JSON responses', async () => {
	await withFetch(
		async () => ({
			ok: true,
			json: async () => {
				throw new SyntaxError('Unexpected token < in JSON');
			},
		}),
		async () => {
			const ctx = { env: {} };
			await assert.rejects(() => weiboUtils.apiGet(ctx, 'https://m.weibo.cn/x'), /非 JSON/);
		},
	);
});

test('apiGet throws for HTTP failures', async () => {
	await withFetch(
		async () => ({ ok: false, status: 418 }),
		async () => {
			const ctx = { env: {} };
			await assert.rejects(() => weiboUtils.apiGet(ctx, 'https://m.weibo.cn/x'), /HTTP 418/);
		},
	);
});

test('formatComments skips comments whose user is gone', async () => {
	await withFetch(
		async () => ({
			ok: true,
			json: async () => ({
				ok: 1,
				data: {
					data: [
						{ id: 1, user: null, text: 'gone' },
						{ id: 2, user: { id: '7', screen_name: 'u7' }, text: 'hello' },
					],
				},
			}),
		}),
		async () => {
			const ctx = { env: {} };
			const status = { comments_count: 2, id: '1', mid: '1' };
			const description = await weiboUtils.formatComments(ctx, '', status);
			assert.match(description, /u7/);
			assert.ok(!description.includes('undefined'));
		},
	);
});
