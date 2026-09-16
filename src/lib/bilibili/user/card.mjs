// 动态卡片 → RSS item 的纯函数集合。
// 不依赖 grpc_helper / cloudflare:sockets，便于在 Node 单元测试中直接 import。

let getPubDate = (ptimeLabelText) => {
	let pubDate = new Date().toUTCString();
	try {
		if (ptimeLabelText.indexOf('小时前') !== -1) {
			let hour = ptimeLabelText.split('小时前')[0];
			pubDate = new Date(new Date().getTime() - hour * 60 * 60 * 1000).toUTCString();
		} else if (ptimeLabelText.indexOf('分钟前') !== -1) {
			let minute = ptimeLabelText.split('分钟前')[0];
			pubDate = new Date(new Date().getTime() - minute * 60 * 1000).toUTCString();
		} else if (ptimeLabelText.indexOf('刚刚') !== -1) {
			pubDate = new Date().toUTCString();
		} else if (ptimeLabelText.indexOf('昨天') !== -1) {
			let hour = ptimeLabelText.split('昨天')[1].split(':')[0];
			let minute = ptimeLabelText.split('昨天')[1].split(':')[1];
			let yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
			pubDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), hour, minute).toUTCString();
		} else if (ptimeLabelText.indexOf('天前') !== -1) {
			let day = ptimeLabelText.split('天前')[0];
			pubDate = new Date(new Date().getTime() - day * 24 * 60 * 60 * 1000).toUTCString();
		} else if (ptimeLabelText.indexOf('年') !== -1) {
			let year = ptimeLabelText.split('年')[0];
			let month = ptimeLabelText.split('年')[1].split('月')[0];
			let day = ptimeLabelText.split('年')[1].split('月')[1].split('日')[0];
			pubDate = new Date(year, month - 1, day).toUTCString();
		} else {
			let year = new Date().getFullYear();
			let month = ptimeLabelText.split('月')[0];
			let day = ptimeLabelText.split('月')[1].split('日')[0];
			pubDate = new Date(year, month - 1, day).toUTCString();
		}
	} catch (e) {}
	return pubDate;
};

let getItemFromDynamicForward = (card) => {
	// title
	let title = '';
	for (let desc of card.extend?.desc || []) {
		title += desc.text;
	}
	// link
	let link = `https://t.bilibili.com/${card.extend.dynIdStr}`;
	// description
	let description = title + '<br/>';
	description += `转发自：@${card.extend.origName}<br/>`;
	for (let desc of card.extend?.origDesc || []) {
		description += desc.text;
	}
	if (card.extend.origImgUrl) {
		description += `<br/><img src="${card.extend.origImgUrl}"/>`;
	}
	let pubDate = new Date().toUTCString();
	let guid = `https://t.bilibili.com/${card.extend.dynIdStr}`;
	let author = '';
	let category = card.cardType;
	for (let _module of card.modules || []) {
		if (_module.moduleType === 'module_author') {
			let ptimeLabelText = _module.moduleAuthor?.ptimeLabelText;
			pubDate = getPubDate(ptimeLabelText);
			author = _module.moduleAuthor?.author?.name;
		}
	}
	return {
		title: title,
		link: link,
		description: description,
		pubDate: pubDate,
		guid: guid,
		author: author,
		category: category,
	};
};

// 构造 B 站官方播放器 iframe（RSSHub 同款参数），直连 player.bilibili.com：
// - 不经 workers.dev 中转——部分网络无法访问 workers.dev，中转会直接导致无画面
// - high_quality=1 按最高可用档起播；danmaku=0 隐藏弹幕栏（未登录时不露"登录"按钮）
// - 画质取决于观看者浏览器的 IP 与登录态：国内直连 + 已登录可达 1080P60
let buildPlayerIframe = (archive) => {
	const params = [];
	if (archive.avid) {
		params.push(`aid=${archive.avid}`);
	}
	if (archive.bvid) {
		params.push(`bvid=${archive.bvid}`);
	}
	if (archive.cid) {
		params.push(`cid=${archive.cid}`);
	}
	params.push('page=1', 'high_quality=1', 'danmaku=0', 'autoplay=0');
	return `<iframe src="https://player.bilibili.com/player.html?${params.join('&')}" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>`;
};

let getItemFromDynamicAv = (card) => {
	let pubDate = new Date().toUTCString();
	let guid = `https://t.bilibili.com/${card.extend.dynIdStr}`;
	let author = '';
	let category = card.cardType;
	// module_dynamic.dynArchive 携带稿件信息：bvid / avid / cid / title / cover / duration
	let archive;
	let descText = '';
	for (let _module of card.modules || []) {
		if (_module.moduleType === 'module_author') {
			let ptimeLabelText = _module.moduleAuthor?.ptimeLabelText;
			pubDate = getPubDate(ptimeLabelText);
			author = _module.moduleAuthor?.author?.name;
		} else if (_module.moduleType === 'module_dynamic') {
			archive = _module.moduleDynamic?.dynArchive;
		} else if (_module.moduleType === 'module_desc') {
			descText = _module.moduleDesc?.text || '';
		}
	}

	// 标题：优先取稿件标题，回落到动态文字
	let title = archive?.title || '';
	if (title === '') {
		for (let desc of card.extend?.origDesc || []) {
			title += desc.text;
		}
	}

	// 有 bvid/avid 时链接直达视频页，并内嵌播放器；否则回落到动态页
	let link = guid;
	let description = '';
	if (archive?.bvid || archive?.avid) {
		link = archive.bvid ? `https://www.bilibili.com/video/${archive.bvid}` : `https://www.bilibili.com/video/av${archive.avid}`;
		description += buildPlayerIframe(archive) + '<br/>';
	}
	const cover = archive?.cover || card.extend?.origImgUrl;
	if (cover) {
		description += `<img src="${cover}"/>`;
	}
	if (descText) {
		description += `<br/>${descText}`;
	}

	return {
		title: title,
		link: link,
		description: description,
		pubDate: pubDate,
		guid: guid,
		author: author,
		category: category,
	};
};

let getItemFromDynamicDraw = (card) => {
	// title
	let title = '';
	for (let desc of card.extend?.origDesc || []) {
		title += desc.text;
	}
	// link
	let link = `https://t.bilibili.com/${card.extend.dynIdStr}`;
	// description
	let description = title + '<br/>';
	for (let cover of card.extend?.opusSummary?.covers || []) {
		description += `<img src="${cover.src}"/><br/>`;
	}

	let pubDate = new Date().toUTCString();
	let guid = `https://t.bilibili.com/${card.extend.dynIdStr}`;
	let author = '';
	let category = card.cardType;
	for (let _module of card.modules || []) {
		if (_module.moduleType === 'module_author') {
			let ptimeLabelText = _module.moduleAuthor?.ptimeLabelText;
			pubDate = getPubDate(ptimeLabelText);
			author = _module.moduleAuthor?.author?.name;
		} else if (_module.moduleType === 'module_desc') {
			description += `<br/>${_module.moduleDesc?.text}`;
		}
	}
	return {
		title: title,
		link: link,
		description: description,
		pubDate: pubDate,
		guid: guid,
		author: author,
		category: category,
	};
};

let getItemFromDynamicDefault = (card) => {
	let title = '';
	let link = `https://t.bilibili.com/${card.extend.dynIdStr}`;
	let description = '';
	let pubDate = new Date().toUTCString();
	let guid = `https://t.bilibili.com/${card.extend.dynIdStr}`;
	let author = '';
	let category = card.cardType;
	for (let _module of card.modules || []) {
		if (_module.moduleType === 'module_desc') {
			title = _module.moduleDesc?.text;
			// description = _module?.moduleDesc?.desc.text;
		} else if (_module.moduleType === 'module_author') {
			let ptimeLabelText = _module.moduleAuthor?.ptimeLabelText;
			pubDate = getPubDate(ptimeLabelText);
			author = _module.moduleAuthor?.author?.name;
		}
	}
	if (title === '') {
		for (let desc of card.extend?.origDesc || []) {
			title += desc.text;
		}
	}
	return {
		title: title,
		link: link,
		description: description,
		pubDate: pubDate,
		guid: guid,
		author: author,
		category: category,
	};
};

let getItemFromPaidDynamic = (card) => {
	let pubDate = new Date().toUTCString();
	let author = '';
	let category = card.cardType;
	for (let _module of card.modules || []) {
		if (_module.moduleType === 'module_author') {
			let ptimeLabelText = _module.moduleAuthor?.ptimeLabelText;
			pubDate = getPubDate(ptimeLabelText);
			author = _module.moduleAuthor?.author?.name;
		}
	}
	return {
		title: '充电专属动态',
		link: `https://t.bilibili.com/${card.extend.dynIdStr}`,
		description: '充电专属动态',
		pubDate: pubDate,
		guid: `https://t.bilibili.com/${card.extend.dynIdStr}`,
		author: author,
		category: category,
	};
};

let getItemFromDynamic = (card) => {
	if (card.extend?.onlyFansProperty?.isOnlyFans) {
		return getItemFromPaidDynamic(card);
	}
	switch (card.cardType) {
		case 'forward':
			return getItemFromDynamicForward(card);
		case 'av':
			return getItemFromDynamicAv(card);
		case 'draw':
			return getItemFromDynamicDraw(card);
		default:
			return getItemFromDynamicDefault(card);
	}
};

export { getItemFromDynamic, getItemFromDynamicAv, getItemFromDynamicForward, getItemFromDynamicDraw, getItemFromDynamicDefault, getPubDate };
