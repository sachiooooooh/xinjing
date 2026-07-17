/* 新镜 · app.js —— 纯原生 JS，零依赖。
   进度对象（可携带，见 PRODUCT.md §6.5）：
   localStorage['xinjing.progress'] = { version, litNodes[], readTips[], dayIndex, lastDailyDate, firstSeen, lastSeen } */

'use strict';

/* ---------- 每日正餐序列（编排顺序，可随时重排；开头必须是最强钩子） ---------- */
const DAILY_ORDER = [
  'tip-002', // 错误记忆 —— 开场即拆记忆
  'tip-032', // 10% 大脑谣言
  'tip-046', // 安慰剂：糖丸也止疼
  'tip-009', // 吊桥效应
  'tip-014', // 测试效应（第一张"有用"卡）
  'tip-053', // 哈洛恒河猴
  'tip-005', // 月亮错觉
  'tip-036', // 马斯洛金字塔（修正）
  'tip-055', // 鬼压床
  'tip-023', // 沉没成本
  'tip-016', // 眼睛里的洞
  'tip-033', // 婴儿全语言耳朵
  'tip-001', // 神奇数字 7
  'tip-048', // 布洛卡失语
  'tip-012', // 巴纳姆效应
  'tip-040', // 自我损耗（修正）
  'tip-058', // 损失厌恶
  'tip-013', // 麦格克效应
  'tip-047', // 冰淇淋与溺水（相关≠因果）
  'tip-003', // H.M.
  'tip-027', // 闻不到自己的香水
  'tip-060', // 曝光效应
  'tip-021', // 确认偏误
  'tip-044', // 学习风格（修正）
  'tip-029', // 视崖
  'tip-050', // 交错练习
  'tip-006', // 左右脑谣言
  'tip-010', // 锚定效应
  'tip-056', // 脸盲症
  'tip-019', // 闪光灯记忆
  'tip-041', // 成长型思维（修正）
  'tip-004', // 舌尖现象
  'tip-054', // 镜子红点测试
  'tip-022', // 可得性启发
  'tip-018', // 熬夜删记忆
  'tip-057', // 负后像
  'tip-039', // 斯坦福监狱（修正）
  'tip-011', // 过度理由
  'tip-051', // 生成效应
  'tip-028', // 白三角
  'tip-059', // 蔡格尼克效应
  'tip-015', // 莫扎特效应
  'tip-007', // 看不见的大猩猩
  'tip-049', // 语言关键期
  'tip-030', // 情绪标注
  'tip-043', // 棉花糖（修正）
  'tip-035', // 测谎仪
  'tip-025', // 倒U定律
  'tip-052', // 流畅性错觉
  'tip-031', // 大五人格
  'tip-037', // 蜡烛问题
  'tip-008', // 潜意识广告骗局
  'tip-045', // 多巴胺（修正）
  'tip-038', // 揉揉止疼
  'tip-042', // 权力姿势（修正）
  'tip-024', // 习得性无助
  'tip-017', // 间隔效应
  'tip-020', // 框架效应
  'tip-026', // 暗适应
  'tip-034'  // 客体永久性
];

const STORE_KEY = 'xinjing.progress';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 埋点封装：统计脚本没加载/被拦截时静默跳过，绝不影响产品 */
function track(category, action, label, value) {
  try {
    if (window._hmt) window._hmt.push(['_trackEvent', category, action, label, value]);
  } catch (e) { /* 忽略 */ }
}

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
  track('daily', 'light', tip.id, P.dayIndex); // 第 N 天的正餐卡被点亮
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

/* ---------- 添加到主屏幕引导 ---------- */
const ADDHOME_KEY = 'xinjing.addhome.dismissed';
function isStandalone() {
  return window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}
function addHomeTip() {
  const ua = navigator.userAgent;
  const wechat = /micromessenger/i.test(ua);
  const ios = /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  if (wechat && ios) return '点右上角 ··· → 选「在 Safari 中打开」，再点底部分享 → 「添加到主屏幕」。';
  if (wechat && android) return '点右上角 ··· → 选「添加到桌面」，新镜就住进桌面了。';
  if (ios) return '点底部的分享按钮 → 选「添加到主屏幕」，新镜就住进桌面了。';
  if (android) return '点右上角菜单 ⋮ → 选「添加到主屏幕 / 安装」，新镜就住进桌面了。';
  return '把本页加到主屏幕或收藏，明天更好找。';
}
function maybeAddHomeHint(root) {
  if (isStandalone()) return;                       // 已在桌面全屏模式，不打扰
  if (localStorage.getItem(ADDHOME_KEY)) return;    // 关过就不再提
  const hint = el(
    '<div class="addhome" role="note">' +
      '<div class="addhome__body">' +
        '<span class="addhome__title">想每天都找得到？把新镜放上桌面</span>' +
        '<span class="addhome__tip">' + esc(addHomeTip()) + '</span>' +
      '</div>' +
      '<button class="addhome__close" aria-label="关闭提示">知道了</button>' +
    '</div>'
  );
  hint.querySelector('.addhome__close').addEventListener('click', () => {
    localStorage.setItem(ADDHOME_KEY, '1');
    hint.style.height = hint.offsetHeight + 'px';
    requestAnimationFrame(() => hint.classList.add('addhome--out'));
    setTimeout(() => hint.remove(), 260);
  });
  root.appendChild(hint);
}

/* ---------- 分享图：把卡片画成 3:4 图片（canvas，零依赖） ---------- */
const SHARE_W = 1080;
const SHARE_PAD = 96;
const SITE_URL = 'sachiooooooh.github.io/xinjing';
const CLOSE_PUNCT = '，。、；：？！）』」》…"’”';

/* 逐字换行（中文可断任意处；行首不落收尾标点） */
function wrapCJK(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      if (CLOSE_PUNCT.includes(ch)) { lines.push(line + ch); line = ''; }
      else { lines.push(line); line = ch; }
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function buildCardImage(tip, dayLabel) {
  await Promise.all([
    document.fonts.load('700 62px "Noto Serif SC"'),
    document.fonts.load('400 42px "Noto Serif SC"'),
    document.fonts.load('700 40px "Noto Serif SC"'),
    document.fonts.load('500 30px "Noto Sans SC"'),
    document.fonts.load('400 28px "Noto Sans SC"')
  ]);

  const W = SHARE_W, PAD = SHARE_PAD, CW = W - PAD * 2;
  const c = document.createElement('canvas');
  const x = c.getContext('2d');

  // 先量后画：算标题/正文行数，定画布高度
  x.font = '700 62px "Noto Serif SC"';
  const titleLines = wrapCJK(x, tip.title, CW);
  x.font = '400 42px "Noto Serif SC"';
  const bodyLines = wrapCJK(x, tip.text, CW);
  const src = tip.source || {};
  const srcText = (src.book || '') + ' · ' + (src.chapter || '');
  x.font = '400 28px "Noto Sans SC"';
  const srcLines = wrapCJK(x, srcText, CW);

  const TITLE_LH = 92, BODY_LH = 80, SRC_LH = 44;
  const headerH = 200;                       // 顶部：印章+品牌+日标
  const pillH = tip.hookType ? 92 : 0;       // 钩子标签
  const titleH = titleLines.length * TITLE_LH + 40;
  const bodyH = bodyLines.length * BODY_LH + 40;
  const srcH = srcLines.length * SRC_LH + 60; // 含分隔线
  const footerH = 140;
  const contentH = PAD + headerH + pillH + titleH + bodyH + srcH + footerH + PAD;
  const H = Math.max(1440, contentH);        // 至少 3:4

  c.width = W; c.height = H;

  // 背景
  x.fillStyle = '#FBFAF7';
  x.fillRect(0, 0, W, H);

  // 顶部：方印「镜」+ 品牌名 + 右侧日标/金点
  let cy = PAD;
  const sealS = 96;
  roundRectPath(x, PAD, cy, sealS, sealS, 20);
  x.fillStyle = '#1A1A1A'; x.fill();
  x.fillStyle = '#FFFFFF';
  x.font = '700 54px "Noto Serif SC"';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('镜', PAD + sealS / 2, cy + sealS / 2 + 4);

  x.textAlign = 'left';
  x.fillStyle = '#1A1A1A';
  x.font = '500 44px "Noto Sans SC"';
  x.fillText('新镜', PAD + sealS + 32, cy + sealS / 2 + 2);

  x.beginPath();
  x.arc(W - PAD - 14, cy + 20, 14, 0, Math.PI * 2);
  x.fillStyle = '#F59E0B'; x.fill();
  if (dayLabel) {
    x.textAlign = 'right';
    x.fillStyle = '#9A9A97';
    x.font = '400 32px "Noto Sans SC"';
    x.fillText(dayLabel, W - PAD - 44, cy + sealS / 2 + 2);
    x.textAlign = 'left';
  }
  cy += headerH;

  // 钩子标签
  if (tip.hookType) {
    x.font = '400 30px "Noto Sans SC"';
    const tw = x.measureText(tip.hookType).width;
    roundRectPath(x, PAD, cy, tw + 48, 60, 14);
    x.fillStyle = '#F5F3EE'; x.fill();
    x.fillStyle = '#5C5C5A';
    x.textBaseline = 'middle';
    x.fillText(tip.hookType, PAD + 24, cy + 32);
    cy += pillH;
  }

  // 标题（宋体）
  x.fillStyle = '#1A1A1A';
  x.font = '700 62px "Noto Serif SC"';
  x.textBaseline = 'alphabetic';
  for (const ln of titleLines) { cy += TITLE_LH; x.fillText(ln, PAD, cy); }
  cy += 40;

  // 正文（宋体）
  x.fillStyle = '#5C5C5A';
  x.font = '400 42px "Noto Serif SC"';
  for (const ln of bodyLines) { cy += BODY_LH; x.fillText(ln, PAD, cy); }
  cy += 40;

  // 分隔线 + 来源
  x.strokeStyle = '#ECEAE3'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(PAD, cy); x.lineTo(W - PAD, cy); x.stroke();
  cy += 20;
  x.fillStyle = '#9A9A97';
  x.font = '400 28px "Noto Sans SC"';
  for (const ln of srcLines) { cy += SRC_LH; x.fillText(ln, PAD, cy); }

  // 底部：品牌语 + 链接（贴底排）
  const fy = H - PAD - 10;
  x.beginPath();
  x.arc(PAD + 12, fy - 10, 12, 0, Math.PI * 2);
  x.fillStyle = '#F59E0B'; x.fill();
  x.fillStyle = '#5C5C5A';
  x.font = '500 30px "Noto Sans SC"';
  x.fillText('新镜 · 每天一张心理学', PAD + 44, fy);
  x.textAlign = 'right';
  x.fillStyle = '#B45309';
  x.font = '400 27px "Noto Sans SC"';
  x.fillText(SITE_URL, W - PAD, fy);
  x.textAlign = 'left';

  return c;
}

/* ---------- Toast：轻量反馈，自动消失 ---------- */
function showToast(msg) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const t = el('<div class="toast" role="status">' + esc(msg) + '</div>');
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('is-on'));
  setTimeout(() => { t.classList.remove('is-on'); setTimeout(() => t.remove(), 300); }, 1800);
}

/* ---------- 面板遮罩：压暗页面区分层级，点遮罩即关闭 ---------- */
function addPanelScrim(onClose) {
  removePanelScrim();
  const s = el('<div class="panel-scrim"></div>');
  s.addEventListener('click', onClose);
  document.body.appendChild(s);
  void s.offsetHeight; // 强制重排，保证过渡触发（不依赖 rAF 时机）
  s.classList.add('is-on');
}
function removePanelScrim() {
  const s = document.querySelector('.panel-scrim');
  if (s) { s.classList.remove('is-on'); setTimeout(() => s.remove(), 300); }
}

function removeSharePanel() {
  removePanelScrim();
  const p = document.querySelector('.share-panel');
  if (p) { p.classList.remove('is-open'); setTimeout(() => p.remove(), 300); }
}

async function showSharePanel(tip, dayLabel) {
  removeBackupPanel(); removeSharePanel();
  const panel = el(
    '<div class="backup-panel share-panel" role="dialog" aria-label="保存卡片图片">' +
      '<div class="backup-panel__title">保存卡片</div>' +
      '<p class="backup-panel__hint share-panel__generating">正在生成图片…</p>' +
      '<div class="share-panel__imgwrap"></div>' +
      '<p class="backup-panel__hint share-panel__tip" hidden>手机上：<b>长按图片</b>即可保存到相册或发给朋友。</p>' +
      '<div class="backup-panel__actions">' +
        '<button class="btn-primary" data-act="download" style="margin-top:0;flex:1.4;" hidden>下载图片</button>' +
        '<button class="btn-ghost" data-act="close" style="flex:1;">关闭</button>' +
      '</div>' +
    '</div>'
  );
  addPanelScrim(removeSharePanel);
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('is-open'));
  panel.querySelector('[data-act="close"]').addEventListener('click', removeSharePanel);

  try {
    const canvas = await buildCardImage(tip, dayLabel);
    const blob = await new Promise((ok, bad) => canvas.toBlob(b => b ? ok(b) : bad(new Error('toBlob failed')), 'image/png'));
    const fileName = 'xinjing-' + tip.id + '.png';
    const file = new File([blob], fileName, { type: 'image/png' });
    const blobUrl = URL.createObjectURL(blob);

    const img = el('<img class="share-panel__img" alt="卡片分享图" />');
    img.src = blobUrl;
    panel.querySelector('.share-panel__imgwrap').appendChild(img);
    panel.querySelector('.share-panel__generating').hidden = true;

    const hint = panel.querySelector('.share-panel__tip');
    const actionBtn = panel.querySelector('[data-act="download"]');
    const isWeChat = /micromessenger/i.test(navigator.userAgent);
    const canShareFile = !isWeChat && typeof navigator.share === 'function' &&
      navigator.canShare && navigator.canShare({ files: [file] });

    if (canShareFile) {
      // 手机：调系统分享面板（里面有"存储图像"一键进相册、发微信等）
      actionBtn.hidden = false;
      actionBtn.textContent = '保存 / 分享';
      actionBtn.addEventListener('click', () => {
        navigator.share({ files: [file], title: tip.title })
          .then(() => showToast('已分享 ✓'))
          .catch(err => { if (err && err.name !== 'AbortError') showToast('没调起分享——长按图片也能保存'); });
      });
      hint.innerHTML = '面板里选「<b>存储图像</b>」即存入相册；也可以直接长按图片保存。';
      hint.hidden = false;
    } else if (isWeChat) {
      // 微信内：无下载无分享 API，长按是唯一正道
      hint.innerHTML = '<b>长按图片</b>即可保存到相册，或发给朋友。';
      hint.hidden = false;
    } else {
      // 桌面：正经下载
      actionBtn.hidden = false;
      actionBtn.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a); a.click(); a.remove();
        showToast('已下载 ✓');
      });
      hint.innerHTML = '手机上打开的话，<b>长按图片</b>即可保存到相册。';
      hint.hidden = false;
    }
    track('share', 'save', tip.id);
  } catch (e) {
    panel.querySelector('.share-panel__generating').textContent = '图片生成失败了——刷新页面再试一次。';
    console.error(e);
  }
}

function saveCardButton(tip, dayLabel) {
  const b = el('<button class="save-card-btn">保存这张卡片 ↓</button>');
  b.addEventListener('click', () => showSharePanel(tip, dayLabel));
  return b;
}

/* ---------- 视图：今日 ---------- */
function viewToday(root) {
  const st = dailyState();
  root.appendChild(el(headerHTML(st.phase === 'fresh' ? st.day : P.dayIndex || null)));
  maybeAddHomeHint(root);

  if (st.phase === 'all-done') {
    root.appendChild(el(
      '<div class="done-card enter"><div class="done-card__title">存货读完了</div>' +
      '<div class="done-card__sub">' + DAILY_ORDER.length + ' 张卡都在你的地图上了。<br>新的卡片正在路上——先去图谱看看你点亮的世界。</div></div>'
    ));
    return;
  }

  const tip = st.tip;
  const card = el('<article class="daily-card enter" id="daily-card">' + cardHTML(tip) + '</article>');
  root.appendChild(card);
  root.appendChild(saveCardButton(tip, '第 ' + st.day + ' 天'));

  const isDone = st.phase === 'done-today';
  const btn = el('<button class="btn-primary enter-d1' + (isDone ? ' is-lit' : '') + '" id="light-btn">' +
    (isDone ? '已点亮 · 明天见' : '读完了，点亮它') + '</button>');

  if (isDone) {
    root.appendChild(btn); // 已读态：安静地留在文档流里
  } else {
    // 未读态：CTA 吸底，永远可见；正文底部加占位防遮挡
    root.appendChild(el('<div class="cta-spacer"></div>'));
    const wrap = el('<div class="cta-wrap"></div>');
    wrap.appendChild(btn);
    root.appendChild(wrap);
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
  const btnHolder = btnEl.closest('.cta-wrap') || btnEl;
  setTimeout(() => { cardEl.classList.add('card-collapsing'); btnHolder.style.opacity = '0'; }, 100);

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
    const isCorr = !!cardEl.querySelector('.tag--correction');          // 复用现成的修正卡标记
    const subline = isCorr
      ? '第 ' + P.dayIndex + ' 天 · 你刚修正了一个旧认知'
      : '第 ' + P.dayIndex + ' 天 · 已收进你的地图';
    const echo = el(
      '<div class="land-echo"><span class="land-echo__dot"></span>' +
      '<span class="land-echo__title">' + (tipTitle ? tipTitle.innerHTML : '') + '</span><br>' +
      subline + '</div>'
    );
    cardEl.parentNode.insertBefore(echo, cardEl);
    cardEl.style.display = 'none';
  }
  if (btnEl) {
    const holder = btnEl.closest('.cta-wrap') || btnEl;
    holder.style.display = 'none';
  }
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
    if (act === 'map') { track('map', 'open', 'landing'); removeLandPanel(); location.hash = '#/map'; }
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
  root.appendChild(saveCardButton(tip, null));

  const read = P.readTips.includes(tip.id);
  const btn = el('<button class="btn-primary enter-d1' + (read ? ' is-lit' : '') + '">' + (read ? '已点亮' : '读完了，点亮它') + '</button>');

  if (read) {
    root.appendChild(btn); // 已读态回归文档流
  } else {
    root.appendChild(el('<div class="cta-spacer"></div>'));
    const wrap = el('<div class="cta-wrap"></div>');
    wrap.appendChild(btn);
    root.appendChild(wrap);
    btn.addEventListener('click', () => {
      lightTip(tip);
      track('browse', 'light', tip.id); // 逛逛里的浏览点亮
      updateTabBadge();
      btn.classList.add('is-lit');
      btn.textContent = '已点亮';
      const ch = chapterOfNode(tip.nodeId);
      if (ch) {
        const stats = chapterStats(ch);
        wrap.appendChild(el('<p class="lit-note">「' + esc(chapterShortName(ch.title)) + '」又亮了一格 · <b>' + stats.pct + '%</b></p>'));
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

  root.appendChild(el('<div class="map-part" style="margin-top:32px;">备份</div>'));
  const backupRow = el('<div style="display:flex;gap:10px;margin-top:8px;"></div>');
  const exportBtn = el('<button class="btn-ghost" style="flex:1;">导出进度</button>');
  const importBtn = el('<button class="btn-ghost" style="flex:1;">导入进度</button>');
  exportBtn.addEventListener('click', exportProgress);
  importBtn.addEventListener('click', () => { importProgress(); });
  backupRow.appendChild(exportBtn);
  backupRow.appendChild(importBtn);
  root.appendChild(backupRow);
  root.appendChild(el('<p style="font-size:12px;color:var(--text-tertiary);margin-top:8px;line-height:1.6;">换设备、重新添加到主屏幕前，先导出一份存到备忘录里。</p>'));
}

/* ---------- 进度备份：导出/导入（换设备、重装图标前先导出） ---------- */
function removeBackupPanel() {
  removePanelScrim();
  const p = document.querySelector('.backup-panel');
  if (p) { p.classList.remove('is-open'); setTimeout(() => p.remove(), 300); }
}

function copyText(text, onDone) {
  // 优先用现代剪贴板 API（HTTPS + 用户手势下可用），失败则退回 execCommand
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => onDone(true)).catch(() => {
      onDone(fallbackCopy(text));
    });
  } else {
    onDone(fallbackCopy(text));
  }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

function exportProgress() {
  removeBackupPanel();
  const payload = JSON.stringify(P);
  const panel = el(
    '<div class="backup-panel" role="dialog" aria-label="导出进度">' +
      '<div class="backup-panel__title">导出进度</div>' +
      '<p class="backup-panel__hint">复制这段文字，存到备忘录或任何地方。以后在「导入进度」里粘贴回来即可恢复。</p>' +
      '<textarea class="backup-panel__ta" readonly></textarea>' +
      '<div class="backup-panel__actions">' +
        '<button class="btn-primary" data-act="copy" style="margin-top:0;flex:1.4;">一键复制</button>' +
        '<button class="btn-ghost" data-act="close" style="flex:1;">关闭</button>' +
      '</div>' +
    '</div>'
  );
  panel.querySelector('.backup-panel__ta').value = payload;
  addPanelScrim(removeBackupPanel);
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('is-open'));

  const copyBtn = panel.querySelector('[data-act="copy"]');
  copyBtn.addEventListener('click', () => {
    copyText(payload, ok => {
      copyBtn.textContent = ok ? '已复制 ✓' : '复制失败，请长按文字手动复制';
      if (ok) copyBtn.classList.add('is-lit');
    });
    track('backup', 'export', '', P.litNodes.length);
  });
  panel.querySelector('[data-act="close"]').addEventListener('click', removeBackupPanel);
  // 点文本框也全选，双保险
  panel.querySelector('.backup-panel__ta').addEventListener('click', e => e.target.select());
}

function importProgress() {
  removeBackupPanel();
  const panel = el(
    '<div class="backup-panel" role="dialog" aria-label="导入进度">' +
      '<div class="backup-panel__title">导入进度</div>' +
      '<p class="backup-panel__hint">把之前导出的那段文字粘贴到下面：</p>' +
      '<textarea class="backup-panel__ta" placeholder="粘贴到这里…"></textarea>' +
      '<p class="backup-panel__err" hidden></p>' +
      '<div class="backup-panel__actions">' +
        '<button class="btn-primary" data-act="restore" style="margin-top:0;flex:1.4;">恢复</button>' +
        '<button class="btn-ghost" data-act="close" style="flex:1;">取消</button>' +
      '</div>' +
    '</div>'
  );
  addPanelScrim(removeBackupPanel);
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('is-open'));

  const ta = panel.querySelector('.backup-panel__ta');
  const err = panel.querySelector('.backup-panel__err');
  const showErr = msg => { err.textContent = msg; err.hidden = false; };

  panel.querySelector('[data-act="restore"]').addEventListener('click', () => {
    const raw = ta.value.trim();
    if (!raw) { showErr('还没有粘贴内容。'); return; }
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) {
      showErr('这段文字读不出来——请确认完整复制了导出的内容，没有多余的换行或截断。');
      return;
    }
    if (!parsed || !Array.isArray(parsed.litNodes) || !Array.isArray(parsed.readTips) || typeof parsed.dayIndex !== 'number') {
      showErr('内容格式不对，不像是新镜导出的进度——请检查是不是复制全了。');
      return;
    }
    const confirmMsg = '将恢复到：第 ' + parsed.dayIndex + ' 天 · 已点亮 ' + parsed.litNodes.length + ' 个知识点。\n\n这会覆盖当前设备上的进度，确定吗？';
    if (!window.confirm(confirmMsg)) return;
    P = {
      version: 1,
      litNodes: parsed.litNodes,
      readTips: parsed.readTips,
      dayIndex: parsed.dayIndex,
      lastDailyDate: parsed.lastDailyDate || null,
      firstSeen: parsed.firstSeen || todayStr(),
      lastSeen: todayStr()
    };
    saveProgress();
    track('backup', 'import', '', P.litNodes.length);
    removeBackupPanel();
    render();
  });
  panel.querySelector('[data-act="close"]').addEventListener('click', removeBackupPanel);
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
    item.addEventListener('click', () => {
      if (t.id === 'map') track('map', 'open', 'tab'); // 主动打开图谱：簇进树留的核心验证指标
      location.hash = t.hash;
    });
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
