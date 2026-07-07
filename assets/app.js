/* 新镜 · app.js —— 纯原生 JS，零依赖。
   进度对象（可携带，见 PRODUCT.md §6.5）：
   localStorage['xinjing.progress'] = { version, litNodes[], readTips[], dayIndex, lastDailyDate, firstSeen, lastSeen } */

'use strict';

/* ---------- 每日正餐序列（编排顺序，可随时重排；开头必须是最强钩子） ---------- */
const DAILY_ORDER = [
  'tip-002', // 你"清楚记得"的事可能没发生过 —— 开场即拆记忆
  'tip-032', // 10% 大脑谣言
  'tip-009', // 吊桥效应
  'tip-016', // 眼睛里的洞
  'tip-014', // 测试效应（第一张"有用"卡）
  'tip-036', // 马斯洛金字塔（首张教材修正）
  'tip-005', // 月亮错觉
  'tip-023', // 沉没成本
  'tip-033', // 婴儿全语言耳朵
  'tip-001', // 神奇数字 7
  'tip-013', // 麦格克效应
  'tip-021', // 确认偏误
  'tip-003', // H.M.
  'tip-027', // 闻不到自己的香水
  'tip-012', // 巴纳姆效应
  'tip-018', // 熬夜删记忆
  'tip-040', // 自我损耗
  'tip-028', // 白三角
  'tip-011', // 过度理由
  'tip-019', // 闪光灯记忆
  'tip-006', // 左右脑谣言
  'tip-010', // 锚定效应
  'tip-029', // 视崖
  'tip-004', // 舌尖现象
  'tip-026', // 暗适应
  'tip-041', // 成长型思维
  'tip-022', // 可得性启发
  'tip-034', // 客体永久性
  'tip-017', // 间隔效应
  'tip-008', // 潜意识广告骗局
  'tip-038', // 揉揉止疼
  'tip-024', // 习得性无助
  'tip-015', // 莫扎特效应
  'tip-039', // 斯坦福监狱
  'tip-007', // 看不见的大猩猩
  'tip-020', // 框架效应
  'tip-030', // 情绪标注
  'tip-043', // 棉花糖
  'tip-035', // 测谎仪
  'tip-025', // 倒U定律
  'tip-044', // 学习风格
  'tip-031', // 大五人格
  'tip-037', // 蜡烛问题
  'tip-045', // 多巴胺
  'tip-042'  // 权力姿势
];

const STORE_KEY = 'xinjing.progress';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 数据与状态 ---------- */
let DB = { tips: [], tipsById: {}, clusters: [], tree: [], chapters: [], sectionsById: {} };
let P = null; // progress

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 损坏则重置 */ }
  return { version: 1, litNodes: [], readTips: [], dayIndex: 0, lastDailyDate: null, firstSeen: todayStr(), lastSeen: todayStr() };
}
function saveProgress() {
  P.lastSeen = todayStr();
  localStorage.setItem(STORE_KEY, JSON.stringify(P));
}

/* ---------- 树的解析：章 → 节（节 dot 为图谱最小显示单位） ---------- */
function parseTree(treeJson) {
  const chapters = [];
  const sectionsById = {};
  for (const part of treeJson.tree) {
    for (const ch of part.children || []) {
      const sections = [];
      for (const sec of ch.children || []) {
        const conceptIds = (sec.children || []).map(c => c.id);
        const s = { id: sec.id, title: sec.title, chapterId: ch.id, conceptIds };
        sections.push(s);
        sectionsById[sec.id] = s;
      }
      chapters.push({ id: ch.id, title: ch.title, part: part.title, sections });
    }
  }
  return { chapters, sectionsById };
}

/* 节 dot 是否点亮：自身被点亮，或其任一概念子节点被点亮 */
function sectionLit(sec) {
  if (P.litNodes.includes(sec.id)) return true;
  return sec.conceptIds.some(id => P.litNodes.includes(id));
}
function chapterOfNode(nodeId) {
  // nodeId 可能是节（ch04-s05）或概念（ch06-s04-c01）：前 4 位是章 id
  const chId = nodeId.slice(0, 4);
  return DB.chapters.find(c => c.id === chId) || null;
}
function sectionOfNode(nodeId) {
  if (DB.sectionsById[nodeId]) return DB.sectionsById[nodeId];
  // 概念 → 所属节：截到 -sNN
  const m = nodeId.match(/^(ch\d+-s\d+)/);
  return m ? DB.sectionsById[m[1]] || null : null;
}
function chapterStats(ch) {
  const total = ch.sections.length;
  const lit = ch.sections.filter(sectionLit).length;
  return { lit, total, pct: total ? Math.round(lit / total * 100) : 0 };
}
function globalStats() {
  let lit = 0, total = 0;
  for (const ch of DB.chapters) { const s = chapterStats(ch); lit += s.lit; total += s.total; }
  return { lit, total, pct: total ? Math.round(lit / total * 100) : 0 };
}
function chapterShortName(title) { return title.replace(/^第.+?章\s*/, ''); }

/* ---------- 点亮 ---------- */
function lightTip(tip) {
  let changed = false;
  if (!P.readTips.includes(tip.id)) { P.readTips.push(tip.id); changed = true; }
  if (!P.litNodes.includes(tip.nodeId)) { P.litNodes.push(tip.nodeId); changed = true; }
  if (changed) saveProgress();
  return changed;
}

/* ---------- 每日机制：个人进度制 ---------- */
function dailyState() {
  if (P.lastDailyDate === todayStr() && P.dayIndex > 0) {
    return { phase: 'done-today', tip: DB.tipsById[DAILY_ORDER[P.dayIndex - 1]], day: P.dayIndex };
  }
  if (P.dayIndex >= DAILY_ORDER.length) return { phase: 'all-done', tip: null, day: P.dayIndex };
  return { phase: 'fresh', tip: DB.tipsById[DAILY_ORDER[P.dayIndex]], day: P.dayIndex + 1 };
}
function consumeDaily(tip) {
  lightTip(tip);
  P.dayIndex += 1;
  P.lastDailyDate = todayStr();
  saveProgress();
}

/* ---------- 工具 ---------- */
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
/* 拉丁文（学者名/年份）→ EB Garamond 斜体 */
function latinize(escaped) {
  return escaped.replace(/([A-Za-z][A-Za-z0-9&.\-'’ ]*[A-Za-z0-9.)])/g, '<span class="latin">$1</span>');
}
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

/* ---------- 渲染：卡片主体（今日 & 阅读页共用） ---------- */
function cardHTML(tip) {
  const isCorrection = (tip.flags || []).includes('textbook-correction');
  const src = tip.source || {};
  let sourceBlock = '';
  if (isCorrection && src.correction) {
    sourceBlock =
      '<span class="src-label">教材怎么讲</span><span class="src-val">' + latinize(esc(src.book + ' · ' + src.chapter)) + '</span>' +
      '<span class="src-label">修正出处</span><span class="src-val">' + latinize(esc(src.correction)) + '</span>';
  } else {
    const extra = src.extra ? ' · ' + src.extra : '';
    sourceBlock = '<span class="src-label">来源</span><span class="src-val">' + latinize(esc((src.book || '') + ' · ' + (src.chapter || '') + extra)) + '</span>';
  }
  return (
    '<div>' +
      '<span class="daily-card__hook-tag">' + esc(tip.hookType || '') + '</span>' +
      (isCorrection ? '<span class="tag tag--correction">教材修正</span>' : '') +
    '</div>' +
    '<h1 class="daily-card__title">' + latinize(esc(tip.title)) + '</h1>' +
    '<p class="daily-card__body">' + latinize(esc(tip.text)) + '</p>' +
    '<div class="daily-card__source">' + sourceBlock + '</div>'
  );
}

function headerHTML(day) {
  const dayPart = day ? '<span class="header__day">今日 · 第 <b>' + day + '</b> 天</span>' : '';
  return '<header class="header"><span class="seal">镜</span><span class="header__name">新镜</span>' + dayPart + '</header>';
}

/* ---------- 视图：今日 ---------- */
function viewToday(root) {
  const st = dailyState();
  root.appendChild(el(headerHTML(st.phase === 'fresh' ? st.day : P.dayIndex || null)));

  if (st.phase === 'all-done') {
    root.appendChild(el(
      '<div class="done-card enter"><div class="done-card__title">存货读完了</div>' +
      '<div class="done-card__sub">45 张卡都在你的地图上了。<br>新的卡片正在路上——先去图谱看看你点亮的世界。</div></div>'
    ));
    return;
  }

  const tip = st.tip;
  const card = el('<article class="daily-card enter" id="daily-card">' + cardHTML(tip) + '</article>');
  root.appendChild(card);

  const isDone = st.phase === 'done-today';
  const btn = el('<button class="btn-primary enter-d1' + (isDone ? ' is-lit' : '') + '" id="light-btn">' +
    (isDone ? '已点亮 · 明天见' : '读完了，点亮它') + '</button>');
  if (isDone) btn.disabled = false;
  root.appendChild(btn);

  if (!isDone) {
    btn.addEventListener('click', () => runLanding(tip, card, btn), { once: true });
  }
}

/* ---------- 落点动效编排 ---------- */
function runLanding(tip, cardEl, btnEl) {
  consumeDaily(tip);
  updateTabBadge();

  const ch = chapterOfNode(tip.nodeId);
  const targetSec = sectionOfNode(tip.nodeId);
  const stats = ch ? chapterStats(ch) : { lit: 0, total: 0, pct: 0 };

  if (reduceMotion || !ch) {
    // 降级：直接呈现结果面板
    btnEl.classList.add('is-lit'); btnEl.textContent = '已点亮 · 明天见'; btnEl.disabled = true;
    showLandPanel(ch, targetSec, stats, true);
    return;
  }

  // 0ms 按钮微震
  btnEl.style.transform = 'scale(0.97)';
  setTimeout(() => { btnEl.style.transform = ''; }, 150);

  // 100ms 卡片收缩为一点
  setTimeout(() => { cardEl.classList.add('card-collapsing'); btnEl.style.opacity = '0'; }, 100);

  // 300ms 浮起迷你地图面板（目标节点未亮）
  setTimeout(() => { showLandPanel(ch, targetSec, stats, false); }, 300);

  // 450ms 金点起飞
  setTimeout(() => {
    const cardRect = cardEl.getBoundingClientRect();
    const target = document.querySelector('.land-panel .map-node[data-target="1"]');
    if (!target) return finishLanding(ch, targetSec, stats, cardEl, btnEl);
    const tRect = target.getBoundingClientRect();
    const dot = el('<div class="fly-dot"></div>');
    const x0 = cardRect.left + cardRect.width / 2 - 6, y0 = cardRect.top + cardRect.height * 0.4;
    const x1 = tRect.left + tRect.width / 2 - 6, y1 = tRect.top + tRect.height / 2 - 6;
    dot.style.left = x0 + 'px'; dot.style.top = y0 + 'px';
    document.body.appendChild(dot);
    const dx = x1 - x0, dy = y1 - y0;
    dot.animate([
      { transform: 'translate(0,0)' },
      { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 60) + 'px)' },
      { transform: 'translate(' + dx + 'px,' + dy + 'px)' }
    ], { duration: 450, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }).onfinish = () => {
      dot.remove();
      finishLanding(ch, targetSec, stats, cardEl, btnEl);
    };
  }, 450);
}

function finishLanding(ch, targetSec, stats, cardEl, btnEl) {
  // 命中：节点亮起 + 脉冲 + 数字跳动
  const target = document.querySelector('.land-panel .map-node[data-target="1"]');
  if (target) { target.classList.add('is-lit', 'just-lit'); }
  const pctEl = document.querySelector('.land-panel__pct');
  if (pctEl) { pctEl.innerHTML = '<span class="tick">' + stats.pct + '%</span>'; }
  // 1400ms 文案 + 动作浮现
  setTimeout(() => {
    const msg = document.querySelector('.land-panel__msg');
    const act = document.querySelector('.land-panel__actions');
    if (msg) msg.classList.add('show');
    if (act) act.classList.add('show');
  }, 500);
  if (cardEl) {
    const tipTitle = cardEl.querySelector('.daily-card__title');
    const echo = el(
      '<div class="land-echo"><span class="land-echo__dot"></span>' +
      '<span class="land-echo__title">' + (tipTitle ? tipTitle.innerHTML : '') + '</span><br>' +
      '第 ' + P.dayIndex + ' 天 · 已收进你的地图</div>'
    );
    cardEl.parentNode.insertBefore(echo, cardEl);
    cardEl.style.display = 'none';
  }
  if (btnEl) btnEl.style.display = 'none';
}

function showLandPanel(ch, targetSec, stats, staticResult) {
  const dots = ch.sections.map(sec => {
    const isTarget = targetSec && sec.id === targetSec.id;
    const lit = staticResult ? sectionLit(sec) : (sectionLit(sec) && !isTarget);
    return '<span class="map-node' + (lit ? ' is-lit' : '') + (staticResult && isTarget ? ' is-lit just-lit' : '') + '"' +
      (isTarget ? ' data-target="1"' : '') + '></span>';
  }).join('');
  const shortName = chapterShortName(ch.title);
  const pct = staticResult ? stats.pct : Math.max(0, Math.round((stats.lit - 1) / stats.total * 100));
  const panel = el(
    '<div class="land-panel" role="dialog" aria-label="点亮结果">' +
      '<div class="land-panel__ch"><span>' + esc(ch.title) + '</span><span class="land-panel__pct">' + pct + '%</span></div>' +
      '<div class="land-panel__dots">' + dots + '</div>' +
      '<div class="land-panel__msg' + (staticResult ? ' show' : '') + '">你已摸到「' + esc(shortName) + '」的 ' + stats.pct + '%。</div>' +
      '<div class="land-panel__actions' + (staticResult ? ' show' : '') + '">' +
        '<button class="btn-ghost" data-act="map">看全图</button>' +
        '<button class="btn-ghost" data-act="close">明天见</button>' +
      '</div>' +
    '</div>'
  );
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('is-open'));
  if (staticResult) {
    const pctEl = panel.querySelector('.land-panel__pct');
    if (pctEl) pctEl.textContent = stats.pct + '%';
  }
  panel.addEventListener('click', e => {
    const act = e.target.getAttribute && e.target.getAttribute('data-act');
    if (act === 'map') { removeLandPanel(); location.hash = '#/map'; }
    if (act === 'close') { removeLandPanel(); render(); }
  });
}
function removeLandPanel() {
  const p = document.querySelector('.land-panel');
  if (p) { p.classList.remove('is-open'); setTimeout(() => p.remove(), 300); }
}

/* ---------- 视图：逛逛（簇货架） ---------- */
function clusterTips(clusterId) {
  return DB.tips.filter(t => (t.clusters || []).includes(clusterId));
}
function viewExplore(root) {
  root.appendChild(el(headerHTML(null)));
  root.appendChild(el('<h1 class="page-title enter">逛逛</h1><p class="page-sub enter">读簇里的卡，一样点亮地图。</p>'));
  const grid = el('<div class="shelf-grid"></div>');
  const sorted = [...DB.clusters].sort((a, b) => a.order - b.order);
  sorted.forEach((c, i) => {
    const tips = clusterTips(c.id);
    const readN = tips.filter(t => P.readTips.includes(t.id)).length;
    const card = el(
      '<button class="cluster-card enter' + (i < 3 ? ' enter-d' + Math.min(i, 2) : '') + '">' +
        '<span class="cluster-card__top"><span class="cluster-card__name">' + esc(c.name) + '</span>' +
        '<span class="cluster-card__meta">' + (readN > 0 ? '<span class="lit-n">' + readN + '</span>/' : '') + tips.length + ' 张</span></span>' +
        '<span class="cluster-card__tagline">' + esc(c.tagline) + '</span>' +
      '</button>'
    );
    card.addEventListener('click', () => { location.hash = '#/cluster/' + c.id; });
    grid.appendChild(card);
  });
  root.appendChild(grid);
}

/* ---------- 视图：簇内列表 ---------- */
function viewCluster(root, clusterId) {
  const c = DB.clusters.find(x => x.id === clusterId);
  if (!c) { location.hash = '#/explore'; return; }
  root.appendChild(el(headerHTML(null)));
  root.appendChild(el('<div class="back-row"><button class="back-btn" id="back">← 逛逛</button></div>'));
  root.querySelector('#back').addEventListener('click', () => { location.hash = '#/explore'; });
  root.appendChild(el('<h1 class="page-title">' + esc(c.name) + '</h1><p class="page-sub">' + esc(c.tagline) + '</p>'));
  const list = el('<div class="tip-list"></div>');
  clusterTips(clusterId).forEach(t => {
    const read = P.readTips.includes(t.id);
    const row = el(
      '<button class="tip-row' + (read ? ' is-read' : '') + '">' +
        '<span class="tip-row__dot"></span>' +
        '<span class="tip-row__title">' + latinize(esc(t.title)) + '</span>' +
      '</button>'
    );
    row.addEventListener('click', () => { location.hash = '#/tip/' + t.id + '?from=' + clusterId; });
    list.appendChild(row);
  });
  root.appendChild(list);
}

/* ---------- 视图：阅读页（浏览） ---------- */
function viewTip(root, tipId, fromCluster) {
  const tip = DB.tipsById[tipId];
  if (!tip) { location.hash = '#/explore'; return; }
  root.appendChild(el(headerHTML(null)));
  const backTo = fromCluster ? '#/cluster/' + fromCluster : '#/explore';
  const backName = fromCluster ? (DB.clusters.find(c => c.id === fromCluster) || {}).name || '返回' : '逛逛';
  root.appendChild(el('<div class="back-row"><button class="back-btn" id="back">← ' + esc(backName) + '</button></div>'));
  root.querySelector('#back').addEventListener('click', () => { location.hash = backTo; });

  const card = el('<article class="daily-card enter">' + cardHTML(tip) + '</article>');
  root.appendChild(card);

  const read = P.readTips.includes(tip.id);
  const btn = el('<button class="btn-primary enter-d1' + (read ? ' is-lit' : '') + '">' + (read ? '已点亮' : '读完了，点亮它') + '</button>');
  root.appendChild(btn);

  if (!read) {
    btn.addEventListener('click', () => {
      lightTip(tip);
      updateTabBadge();
      btn.classList.add('is-lit');
      btn.textContent = '已点亮';
      const ch = chapterOfNode(tip.nodeId);
      if (ch) {
        const stats = chapterStats(ch);
        root.appendChild(el('<p class="lit-note">「' + esc(chapterShortName(ch.title)) + '」又亮了一格 · <b>' + stats.pct + '%</b></p>'));
      }
    }, { once: true });
  }
}

/* ---------- 视图：图谱 ---------- */
function viewMap(root) {
  sessionStorage.setItem('xinjing.mapSeen', String(P.litNodes.length));
  updateTabBadge();
  root.appendChild(el(headerHTML(null)));
  const g = globalStats();
  root.appendChild(el('<h1 class="page-title enter">我的图谱</h1>'));
  root.appendChild(el(
    '<div class="map-stats enter"><span class="map-stats__big">' + g.lit + '<span class="of"> / ' + g.total + '</span></span>' +
    '<span class="map-stats__pct">' + g.pct + '%</span></div>' +
    '<div class="map-stats__label enter">已点亮的知识点 · 普通心理学</div>'
  ));
  root.appendChild(el('<div class="progress enter-d1"><div class="progress__fill" style="width:' + g.pct + '%"></div></div>'));

  let lastPart = '';
  for (const ch of DB.chapters) {
    if (ch.part !== lastPart) {
      lastPart = ch.part;
      root.appendChild(el('<div class="map-part">' + esc(ch.part) + '</div>'));
    }
    const s = chapterStats(ch);
    const dots = ch.sections.map(sec =>
      '<span class="map-node' + (sectionLit(sec) ? ' is-lit' : '') + '" title="' + esc(sec.title) + '"></span>'
    ).join('');
    root.appendChild(el(
      '<div class="map-chapter">' +
        '<div class="map-chapter__head"><span class="map-chapter__name">' + esc(ch.title) + '</span>' +
        '<span class="map-chapter__pct' + (s.pct === 0 ? ' is-zero' : '') + '">' + (s.pct === 0 ? '未点亮' : s.pct + '%') + '</span></div>' +
        '<div class="map-chapter__dots">' + dots + '</div>' +
      '</div>'
    ));
  }
  if (g.lit === 0) {
    root.appendChild(el('<p class="map-empty">地图还没亮——从今天这张开始。</p>'));
  }
}

/* ---------- 底部导航 ---------- */
const TABS = [
  { id: 'today', hash: '#/today', name: '今日',
    icon: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>' },
  { id: 'explore', hash: '#/explore', name: '逛逛',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>' },
  { id: 'map', hash: '#/map', name: '图谱',
    icon: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6h7M6 8.5v7M18 8.5v7M8.5 18h7"/></svg>' }
];
function buildTabbar() {
  const bar = el('<nav class="tabbar" aria-label="主导航"></nav>');
  for (const t of TABS) {
    const item = el('<button class="tabbar__item" data-tab="' + t.id + '" aria-label="' + t.name + '">' + t.icon + '<span>' + t.name + '</span></button>');
    item.addEventListener('click', () => { location.hash = t.hash; });
    bar.appendChild(item);
  }
  document.body.appendChild(bar);
}
function updateTabbar(active) {
  document.querySelectorAll('.tabbar__item').forEach(i => {
    i.classList.toggle('is-active', i.getAttribute('data-tab') === active);
  });
  updateTabBadge();
}
function updateTabBadge() {
  const seen = Number(sessionStorage.getItem('xinjing.mapSeen') || 0);
  const item = document.querySelector('.tabbar__item[data-tab="map"]');
  if (!item) return;
  let badge = item.querySelector('.tabbar__badge');
  const hasNew = P.litNodes.length > seen;
  if (hasNew && !badge) item.appendChild(el('<span class="tabbar__badge"></span>'));
  if (!hasNew && badge) badge.remove();
}

/* ---------- 路由 ---------- */
function render() {
  removeLandPanel();
  const root = document.getElementById('app');
  root.innerHTML = '';
  const hash = location.hash || '#/today';
  const [path, query] = hash.slice(2).split('?');
  const seg = path.split('/');
  const from = (query || '').split('=')[1] || '';

  if (seg[0] === 'explore') { updateTabbar('explore'); viewExplore(root); }
  else if (seg[0] === 'cluster' && seg[1]) { updateTabbar('explore'); viewCluster(root, seg[1]); }
  else if (seg[0] === 'tip' && seg[1]) { updateTabbar('explore'); viewTip(root, seg[1], from); }
  else if (seg[0] === 'map') { updateTabbar('map'); viewMap(root); }
  else { updateTabbar('today'); viewToday(root); }
  window.scrollTo(0, 0);
}

/* ---------- 启动 ---------- */
async function boot() {
  const [tipsJson, treeJson, clustersJson] = await Promise.all([
    fetch('./data/tips.json').then(r => r.json()),
    fetch('./data/general-psychology.json').then(r => r.json()),
    fetch('./data/clusters.json').then(r => r.json())
  ]);
  DB.tips = tipsJson.tips;
  DB.tips.forEach(t => { DB.tipsById[t.id] = t; });
  DB.clusters = clustersJson.clusters;
  const parsed = parseTree(treeJson);
  DB.chapters = parsed.chapters;
  DB.sectionsById = parsed.sectionsById;

  P = loadProgress();
  saveProgress();

  buildTabbar();
  window.addEventListener('hashchange', render);
  render();
}

boot().catch(err => {
  document.getElementById('app').innerHTML =
    '<div class="done-card" style="margin-top:40px"><div class="done-card__title">加载失败</div>' +
    '<div class="done-card__sub">数据没读到——请通过本地服务器或线上地址访问（file:// 打不开）。</div></div>';
  console.error(err);
});
