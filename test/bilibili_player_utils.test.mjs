import test from 'node:test';
import assert from 'node:assert/strict';

import { isAllowedStreamHost, toBase64Url, fromBase64Url, toProxyUrl, buildMpd, playerPageHtml, fallbackPageHtml } from '../src/lib/bilibili/player_utils.mjs';

const DASH_DATA = {
	timelength: 1066666,
	dash: {
		video: [
			{ id: 116, codecs: 'avc1.640034', bandwidth: 3000000, width: 1920, height: 1080, frame_rate: '16000/672', base_url: 'https://upos-sz-mirror.bilivideo.com/v116.m4s?a=1&b=2', backup_url: ['https://xy.mcdn.bilivideo.cn:8082/v116.m4s'], segment_base: { initialization: '0-962', index_range: '963-1200' } },
			{ id: 116, codecs: 'hev1.1.6.L123.90', bandwidth: 2400000, width: 1920, height: 1080, base_url: 'https://upos-sz-mirror.bilivideo.com/hev116.m4s', segment_base: { initialization: '0-900', index_range: '901-1100' } },
			{ id: 80, codecs: 'avc1.640032', bandwidth: 1500000, width: 1920, height: 1080, base_url: 'https://upos-sz-mirror.bilivideo.com/v80.m4s', segment_base: { initialization: '0-900', index_range: '901-1100' } },
		],
		audio: [
			{ id: 30280, codecs: 'mp4a.40.2', bandwidth: 320000, base_url: 'https://upos-sz-mirror.bilivideo.com/a30280.m4s', segment_base: { initialization: '0-100', index_range: '101-200' } },
			{ id: 30216, codecs: 'mp4a.40.2', bandwidth: 64000, base_url: 'https://upos-sz-mirror.bilivideo.com/a30216.m4s', segment_base: { initialization: '0-100', index_range: '101-200' } },
		],
	},
};

test('isAllowedStreamHost whitelists bilibili cdn hosts only', () => {
	assert.equal(isAllowedStreamHost('upos-sz-mirror.bilivideo.com'), true);
	assert.equal(isAllowedStreamHost('xy113x207x85x219xy.mcdn.bilivideo.cn'), true);
	assert.equal(isAllowedStreamHost('upos-hz-mirrorakam.akamaized.net'), true);
	assert.equal(isAllowedStreamHost('evil.com'), false);
	assert.equal(isAllowedStreamHost('bilivideo.com.evil.com'), false);
	assert.equal(isAllowedStreamHost(''), false);
	assert.equal(isAllowedStreamHost(undefined), false);
});

test('base64url helpers round trip', () => {
	const url = 'https://upos.bilivideo.com/v.m4s?e=1&f=2+3/4=';
	assert.equal(fromBase64Url(toBase64Url(url)), url);
});

test('toProxyUrl builds worker stream url', () => {
	const p = toProxyUrl('https://a.bilivideo.com/x.m4s', 'https://example.com');
	assert.ok(p.startsWith('https://example.com/rss/bilibili/stream?u='));
	assert.equal(fromBase64Url(new URL(p).searchParams.get('u')), 'https://a.bilivideo.com/x.m4s');
});

test('buildMpd prefers avc1, sorts by quality, proxies urls and escapes xml', () => {
	const mpd = buildMpd(DASH_DATA, { origin: 'https://example.com' });

	assert.match(mpd, /mediaPresentationDuration="PT1066.666S"/);
	assert.match(mpd, /id="v116"/);
	assert.match(mpd, /codecs="avc1\.640034"/);
	assert.ok(!mpd.includes('hev1'), 'hevc duplicate of same quality should be dropped when avc1 exists');
	const ids = [...mpd.matchAll(/id="v(\d+)"/g)].map((m) => Number(m[1]));
	assert.deepEqual(ids, [116, 80]);
	assert.match(mpd, /id="a30280"/);
	assert.match(mpd, /<BaseURL>https:\/\/example\.com\/rss\/bilibili\/stream\?u=/);
	assert.ok(!mpd.includes('?a=1&b=2'), 'raw upstream url should be hidden inside the proxy token');
	assert.match(mpd, /<SegmentBase indexRange="963-1200"><Initialization range="0-962"\/><\/SegmentBase>/);
});

test('playerPageHtml embeds mpd and dashjs cdn chain', () => {
	const html = playerPageHtml({ mpd: '<MPD></MPD>', bvid: 'BV1xx411c7mD', autoplay: false, qualityLabel: '高清 1080P60' });

	assert.match(html, /id="mpd"/);
	assert.match(html, /dashjs@4\.7\.4/);
	assert.match(html, /cdn\.jsdelivr\.net/);
	assert.match(html, /player\.initialize\(document\.getElementById\('v'\), url, false\)/);
});

test('fallbackPageHtml is a pure official player embed, RSSHub style', () => {
	const html = fallbackPageHtml({ bvid: 'BV1xx411c7mD' });

	assert.match(html, /player\.bilibili\.com\/player\.html\?bvid=BV1xx411c7mD&page=1&high_quality=1&danmaku=0&autoplay=0/);
	assert.ok(!html.includes('高画质不可用'), 'no note bar');
	assert.ok(!html.includes('打开视频页'), 'no extra link');
	assert.ok(!html.includes('登录'), 'no login UI of our own');
});
