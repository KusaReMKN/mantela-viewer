'use strict';

/**
 * ノード
 * @typedef { object } Node
 * @property { string } id - 識別子
 * @property { string[] } names - 名前
 * @property { string } type - 種別
 */

/**
 * エッヂ
 * @typedef { object } Edge
 * @property { string } from - 対応する Node の id
 * @property { string } to - 対応する Node の id
 * @property { string } label - 表示するラベル
 */

/**
 * グラフ
 * @typedef { object } Graph
 * @property { Node[] } nodes - Node の列
 * @property { Edge[] } edges - Edge の列
 */

/**
 * mantela.json からグラフを生成する
 * @param { string } firstMantela - 起点の mantela.json の URL
 * @param { number } maxNest - 探索する交換局のホップ数
 * @param { HTMLElement } elemStat - ステータス表示用の HTML 要素
 */
async function
generageGraph(firstMantela, maxNest = Infinity, elemStat = undefined)
{
	/**
	 * ステータスの更新（指定されていれば）
	 * @param { string } mesg - 表示するメッセージ
	 */
	function updateStatus(mesg) {
		if (elemStat && 'textContent' in elemStat)
			elemStat.textContent = mesg;
	}

	/**
	 * ノードの集合体
	 * @type { Map<string, Node }
	 */
	const nodes = new Map();

	/**
	 * エッヂの集合体
	 * @type { Edge[] }
	 */
	const edges = [];

	/**
	 * 探索キュー
	 * @var { object[] }
	 * @property { string } url - mantela.json の URL
	 * @property { number } nest - 階層の深さ
	 */
	const queue = [ { url: firstMantela, nest: 0 } ];

	/**
	 * 訪問済 URL, ID
	 * @var { Set<string> }
	 */
	const visited = new Set();

	while (queue.length > 0) {
		const current = queue.shift();

		/* 訪問済 URL や最大深さより深過ぎる場合は辿らない */
		if (visited.has(current.url) || current.nest > maxNest)
			continue;

		/* mantela.json を取得する */
		updateStatus(current.url);
		const mantela = await fetch(current.url, { mode: 'cors' })
				.then(res => res.json())
				.catch(err => new Error(err));
		if (mantela instanceof Error) {
			console.error(mantela, current.url);
			updateStatus(mantela + current.url);
			continue;
		}
		visited.add(current.url);

		/* 自分の情報を登録する */
		if ('aboutMe' in mantela) {
			const aboutMe = mantela.aboutMe;
			const me = nodes.get(aboutMe.identifier);
			/* 既に知られている局の場合、呼び名を追加 */
			if (me)
				me.names.push(aboutMe.name);
			else
				nodes.set(aboutMe.identifier, {
					id: aboutMe.identifier,
					names: [ aboutMe.name ],
					type: 'PBX',
				});
		} else {
			/* 自分の情報すら名乗れない局の情報は登録できない */
			continue;
		}

		/* 訪問済 ID の場合はここでおしまい */
		const curNode = nodes.get(mantela.aboutMe.identifier);
		if (visited.has(curNode.id))
			continue;
		visited.add(curNode.id);

		/* 内線番号を登録する */
		if ('extensions' in mantela)
			mantela.extensions.forEach((e, i) => {
				const nodeId = `${curNode.id}-${crypto.randomUUID()}`;
				/* 内線追加 */
				nodes.set(nodeId, {
					id: nodeId,
					names: [ e.name ],
					type: e.type,
				});
				/* 番号追加 */
				edges.push({
					from: curNode.id,
					to: nodeId,
					label: e.extension,
				});
			});

		/* 接続局を登録する（接続数を考慮する） */
		if ('providers' in mantela && current.nest < maxNest)
			mantela.providers.forEach(e => {
				const node = nodes.get(e.identifier);
				/* 既に知られている局の場合、呼び名を追加 */
				if (node)
					node.names.push(e.name);
				else
					nodes.set(e.identifier, {
						id: e.identifier,
						names: [ e.name ],
						type: 'PBX',
					});
				/* 番号追加 */
				edges.push({
					from: curNode.id,
					to: e.identifier,
					label: e.prefix,
				});
				/* キュー追加 */
				if (e.mantela)
					queue.push({
						url: e.mantela,
						nest: current.nest + 1,
					});
			});
	}

	/**
	 * 最終的に返却するグラフ構造
	 * @type { Graph }
	 */
	const graph = {
		nodes: Array.from(nodes.values()),
		edges: edges,
	};

	updateStatus('Done.');
	return graph;
}

/**
 * VoIP 網の接続情報を表示する
 * @param { HTMLElement } container - 可視化結果を格納する要素
 * @param { Graph } graph - 接続情報
 */
function
graph2vis(container, graph)
{
	const nodes = graph.nodes.map(e => ({
		id: e.id,
		label: e.names[0],
		color: e.type !== 'PBX' && 'orange',
	}));
	const edges = graph.edges;

	const data = {
		nodes,
		edges,
	};
	const options = {
		edges: {
			arrows: 'to',
		},
	};

	return new vis.Network(container, data, options);
}

/*
 * フォーム送信時のイベントハンドラ
 * mantela.json を取得し、接続情報を解析し、表示する。
 */
formMantela.addEventListener('submit', async e => {
	e.preventDefault();
	btnGenerate.disabled = true;
	const limit = checkNest.checked ? +numNest.value : Infinity;
	const graph = await generageGraph(urlMantela.value, limit, outputStatus);
	graph2vis(divMantela, graph);
	secMandala.scrollIntoView({
		behavior: 'smooth',
		block: 'start',
	});
	btnGenerate.disabled = false;
});

/*
 * 表示結果を大きく表示するためのハック
 */
const autoFit = new ResizeObserver(entries => {
	entries.forEach(e => {
		e.target.style.left = null;
		const { x } = e.target.getBoundingClientRect();
		e.target.style.left = `-${x}px`;
	});
});
autoFit.observe(divMantela);

/*
 * first のパラメータが指定されているときは自動入力して表示する
 */
const urlSearch = new URLSearchParams(document.location.search);
if (urlSearch.get('first')) {
	urlMantela.value = urlSearch.get('first');
	btnGenerate.click();
}
