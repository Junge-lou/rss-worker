import test from 'node:test';
import assert from 'node:assert/strict';

import { getItemFromDynamic, getItemFromDynamicAv } from '../src/lib/bilibili/user/card.mjs';

const makeAvCard = (overrides = {}) => ({
	cardType: 'av',
	extend: {
		dynIdStr: '123456',
		origDesc: [{ text: '动态文字' }],
		origImgUrl: 'https://i0.hdslb.com/bfs/old_cover.jpg',
	},
	modules: [
		{ moduleType: 'module_author', moduleAuthor: { ptimeLabelText: '3小时前', author: { name: 'uploader' } } },
		{
			moduleType: 'module_dynamic',
			moduleDynamic: {
				dynArchive: {
					title: '视频标题',
					bvid: 'BV1xx411c7mD',
					avid: '123',
					cid: '456',
					cover: 'https://i0.hdslb.com/bfs/archive/new_cover.jpg',
				},
			},
		},
		{ moduleType: 'module_desc', moduleDesc: { text: '动态附言' } },
	],
	...overrides,
});

test('getItemFromDynamicAv links to the video page and embeds the player', () => {
	const item = getItemFromDynamicAv(makeAvCard());

	assert.equal(item.link, 'https://www.bilibili.com/video/BV1xx411c7mD');
	assert.equal(item.title, '视频标题');
	assert.match(item.description, /player\.bilibili\.com\/player\.html\?aid=123&bvid=BV1xx411c7mD&cid=456&page=1&autoplay=0/);
	assert.match(item.description, /archive\/new_cover\.jpg/);
	assert.match(item.description, /动态附言/);
	assert.equal(item.author, 'uploader');
});

test('getItemFromDynamicAv falls back to the dynamic page when archive is missing', () => {
	const card = makeAvCard();
	card.modules = card.modules.filter((m) => m.moduleType !== 'module_dynamic');

	const item = getItemFromDynamicAv(card);

	assert.equal(item.link, 'https://t.bilibili.com/123456');
	assert.equal(item.title, '动态文字');
	assert.ok(!item.description.includes('iframe'));
	assert.match(item.description, /old_cover\.jpg/);
});

test('getItemFromDynamicAv falls back to avid when bvid is missing', () => {
	const card = makeAvCard();
	card.modules = card.modules.map((m) =>
		m.moduleType === 'module_dynamic'
			? { moduleType: 'module_dynamic', moduleDynamic: { dynArchive: { title: '视频标题', avid: '123' } } }
			: m,
	);

	const item = getItemFromDynamicAv(card);

	assert.equal(item.link, 'https://www.bilibili.com/video/av123');
	assert.match(item.description, /player\.bilibili\.com\/player\.html\?aid=123&page=1&autoplay=0/);
});

test('getItemFromDynamic keeps forwarding av cards to the av builder', () => {
	const item = getItemFromDynamic(makeAvCard());

	assert.equal(item.link, 'https://www.bilibili.com/video/BV1xx411c7mD');
});

test('getItemFromDynamicAv points iframe to worker player page when origin is given', () => {
	const item = getItemFromDynamicAv(makeAvCard(), 'https://rss-worker.example.workers.dev');

	// description 处于 CDATA 中，& 无需转义
	assert.match(item.description, /src="https:\/\/rss-worker\.example\.workers\.dev\/rss\/bilibili\/player\/BV1xx411c7mD\?cid=456&autoplay=0"/);
	assert.ok(!item.description.includes('player.bilibili.com/player.html'));
});
