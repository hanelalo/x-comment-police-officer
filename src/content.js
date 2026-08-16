/**
 * XCPO 内容脚本 —— 运行在 x.com / twitter.com
 *
 * 职责：
 *  1. 监听 DOM 变化，识别每条 tweet/回复（article[data-testid="tweet"]）
 *  2. 抽取文本/昵称/ID，交给引擎评分
 *  3. 命中阈值 → 彻底隐藏（display:none !important），不留空隙
 *  4. 话题抑制：主推文若本身在聊招嫖话题（如嫖娼新闻），回复中讨论该话题不被误杀
 *  5. 主页深查：边界分值评论，拉取作者主页 bio 加分（保守、限速、失败静默）
 *  6. 统计上报（popup / badge）
 */
(() => {
  'use strict';
  if (window.__XCPO_LOADED__) return;
  window.__XCPO_LOADED__ = true;

  const CFG = window.XCPO_CONFIG;
  const Engine = window.XCPO_Engine;
  if (!CFG || !Engine) return;

  const engine = Engine.create(CFG.DEFAULT_CONFIG);
  const DEFAULTS = CFG.DEFAULT_CONFIG;

  // ========== 状态 ==========
  const state = {
    cfg: { ...DEFAULTS },
    processedText: new Map(),           // article -> 当前文本哈希（内容变化则重新检测）
    hidden: new Map(),                 // article -> {snippet, handle, reasons, score}
    textCount: new Map(),              // 去噪文本 -> 出现次数（重复刷屏）
    profileChecked: new Map(),         // handle -> timestamp
    profileRate: { n: 0, t: Date.now() },
    mainStatus: null,                  // 当前线程主推文 article
    suppressTerms: new Set(),          // 主推文命中的关键词（话题抑制）
    suppressPatterns: new Set(),       // 主推文命中的规则 id
    hiddenCount: 0,                    // 本页累计
    recent: [],                        // 最近隐藏（最多 30 条）
    scanQueued: false,
    statsDirty: false,
    errors: [],                        // 运行时错误（调试）
    scanCount: 0,                      // 扫描次数（调试）
    processedLog: [],                  // 最近处理记录（调试）
    booted: false,
  };

  // 调试：暴露运行状态到 DOM（主世界可读），生产无害（隐藏元素）
  function exposeDebug() {
    try {
      let el = document.getElementById('xcpo-debug');
      if (!el) {
        el = document.createElement('div');
        el.id = 'xcpo-debug';
        el.style.display = 'none';
        document.documentElement.appendChild(el);
      }
      el.textContent = JSON.stringify({
        count: state.hiddenCount,
        cfg: state.cfg,
        errors: state.errors.slice(-5),
        scanCount: state.scanCount,
        booted: state.booted,
        processedTotal: state.processedText.size,
        log: state.processedLog.slice(-8),
      });
    } catch (e) { /* ignore */ }
  }
  setInterval(exposeDebug, 2000);

  // 捕获内容脚本运行时错误
  try {
    window.addEventListener('error', (e) => {
      state.errors.push((e && e.message) || String(e));
      if (state.errors.length > 20) state.errors.shift();
    });
    window.addEventListener('unhandledrejection', (e) => {
      state.errors.push('unhandledrejection: ' + (e && e.reason && e.reason.message ? e.reason.message : String(e && e.reason)));
      if (state.errors.length > 20) state.errors.shift();
    });
  } catch (e) { /* ignore */ }

  // ========== 配置加载 ==========
  try {
    chrome.storage.sync.get({ config: DEFAULTS }, (c) => {
      state.cfg = { ...DEFAULTS, ...(c.config || {}) };
      applyModeCss();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.config) {
        state.cfg = { ...DEFAULTS, ...changes.config.newValue };
        applyModeCss();
        scheduleRescan();   // 配置变更后按新配置重新判定
      }
    });
  } catch (e) { /* 非扩展环境（测试） */ }

  // ========== 样式 ==========
  function applyModeCss() {
    const mode = state.cfg.mode === 'dim' ? 'dim' : 'hide';
    const el = document.getElementById('xcpo-style');
    if (el) el.textContent = STYLE[mode];
  }
  const STYLE = {
    hide: '.xcpo-hidden{display:none !important;}',
    dim: '.xcpo-hidden{opacity:.12 !important;filter:grayscale(.7) !important;pointer-events:none !important;}',
  };
  function injectStyle() {
    if (document.getElementById('xcpo-style')) return;
    const s = document.createElement('style');
    s.id = 'xcpo-style';
    s.textContent = STYLE.hide;
    (document.head || document.documentElement).appendChild(s);
  }

  // ========== DOM 工具 ==========
  const TWEET_SEL = 'article[data-testid="tweet"]';

  function getStatusId() {
    const m = location.pathname.match(/^\/[^/]+\/status\/(\d+)/);
    return m ? m[1] : null;
  }

  function extractText(article) {
    const t = article.querySelector('[data-testid="tweetText"]');
    if (t && t.innerText) return t.innerText;
    return article.innerText || '';
  }

  function extractInfo(article) {
    let name = '', handle = '';
    const user = article.querySelector('[data-testid="User-Name"]');
    if (user) {
      const lines = (user.innerText || '').split('\n');
      name = (lines[0] || '').trim();
      const m = (user.innerText || '').match(/@([A-Za-z0-9_]+)/);
      if (m) handle = m[1];
    }
    if (!name) {
      const a = article.querySelector('a[href^="/"][role="link"]');
      if (a) name = (a.innerText || '').trim().split('\n')[0];
    }
    if (!handle) {
      const a = article.querySelector('a[href^="/"][href*="/status/"]');
      const m = a && (a.getAttribute('href') || '').match(/^\/([^/]+)\/status\//);
      if (m) handle = m[1];
    }
    return {
      text: extractText(article),
      name: name.slice(0, 60),
      handle: Engine.normalizeHandle(handle),
    };
  }

  function snippetOf(article, maxLen) {
    const t = extractText(article).replace(/\s+/g, ' ');
    return t.length > (maxLen || 40) ? t.slice(0, maxLen || 40) + '…' : t;
  }

  function findMainStatus() {
    const id = getStatusId();
    if (!id) return null;
    const link = document.querySelector(`${TWEET_SEL} a[href*="/status/${id}"]`);
    return link ? link.closest(TWEET_SEL) : null;
  }

  // ========== 话题抑制 ==========
  function updateContext() {
    const main = findMainStatus();
    if (main !== state.mainStatus) {
      state.mainStatus = main;
      state.suppressTerms.clear();
      state.suppressPatterns.clear();
      if (main) {
        const res = engine.scoreText(extractText(main), { useEmojiNoise: false });
        for (const h of res.hits) {
          if (h.type === 'keyword') state.suppressTerms.add(h.term);
          if (h.type === 'pattern') state.suppressPatterns.add(h.term);
        }
      }
    }
  }

  // ========== 隐藏 ==========
  function hideArticle(article, res, handle) {
    state.hidden.set(article, {
      snippet: snippetOf(article),
      full: extractText(article).replace(/\s+/g, ' ').trim(),  // 完整文本，弹窗可展开查看
      handle,
      reasons: res.reasons.slice(0, 6),
      score: res.score,
    });
    article.classList.add('xcpo-hidden');
    article.setAttribute('aria-hidden', 'true');
    // 如果外层 cellInnerDiv 只包了这一条，整体隐藏更干净（不残留分隔线空隙）
    const cell = article.closest('[data-testid="cellInnerDiv"]');
    if (cell && cell.querySelectorAll(TWEET_SEL).length === 1) {
      cell.classList.add('xcpo-hidden');
    }
    state.hiddenCount++;
    state.recent.unshift({ ...state.hidden.get(article), time: Date.now() });
    state.recent = state.recent.slice(0, 30);
    markStatsDirty();
  }

  function reapplyHides() {
    // React 重渲染可能覆盖 class/style，定期补刀
    for (const el of state.hidden.keys()) {
      if (el.isConnected && !el.classList.contains('xcpo-hidden')) {
        el.classList.add('xcpo-hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    }
  }

  // ========== 主页深查 ==========
  async function maybeDeepCheck(article, info, baseScore, threshold) {
    const cfg = state.cfg;
    if (!cfg.useProfileCheck) return;
    if (baseScore < 6 || baseScore >= threshold) return;
    const handle = info.handle;
    if (!handle) return;
    const now = Date.now();
    if (now - state.profileRate.t > 60000) { state.profileRate.t = now; state.profileRate.n = 0; }
    if (state.profileRate.n >= (cfg.profileCheckPerMinute || 15)) return;
    const last = state.profileChecked.get(handle);
    if (last && now - last < 10 * 60000) return;   // 10 分钟缓存
    state.profileChecked.set(handle, now);
    state.profileRate.n++;
    try {
      const res = await fetch(`https://x.com/i/api/1.1/users/show.json?screen_name=${encodeURIComponent(handle)}`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const u = await res.json();
      const pb = engine.profileBonus(u);
      if (pb.bonus > 0 && baseScore + pb.bonus >= threshold) {
        hideArticle(article, {
          score: baseScore + pb.bonus,
          reasons: [...resReasons(baseScore), ...pb.reasons.map((r) => `[主页] ${r}`)],
        }, handle);
      }
    } catch (e) { /* 静默失败 */ }
  }
  function resReasons(score) { return [`[+${score}] 文本信号`]; }

  // ========== 主流程 ==========
  function processArticle(article) {
    const info = extractInfo(article);
    const handle = info.handle;

    // 关键：X 虚拟滚动会先插骨架再填内容、且复用元素换内容。
    // 文本和昵称都没渲染 → 骨架期，不处理不标记，等下次 scan。
    // 文本太短（如「顶」「j」）也不能跳过——昵称硬信号必须独立检测。
    const textKey = Engine.cleanText(info.text);
    const nameKey = (info.name || '').trim();
    if (!textKey && !nameKey) return;

    // 内容变化检测：文本 >=2 字用文本做指纹；短文本用昵称做指纹（昵称变了即重新处理）
    const prev = state.processedText.get(article);
    if (textKey.length >= 2) {
      if (prev === textKey) return;
      state.processedText.set(article, textKey);
    } else {
      const fp = '@' + nameKey;
      if (prev === fp) return;
      state.processedText.set(article, fp);
    }

    // 调试记录
    state.processedLog.push({ t: (textKey || nameKey || '?').slice(0, 30), h: handle, s: 0 });
    if (state.processedLog.length > 30) state.processedLog.shift();

    // 黑白名单（黑名单优先）
    if (state.cfg.blacklist.includes(handle)) {
      hideArticle(article, { score: 999, reasons: ['[黑名单] 账号被手动屏蔽'] }, handle);
      return;
    }
    if (state.cfg.whitelist.includes(handle)) return;
    if (!state.cfg.enabled) return;

    const isReply = !!state.mainStatus && article !== state.mainStatus;

    // 范围控制：「仅评论区」模式下，首页信息流/搜索页/用户主页完全不处理
    if (state.cfg.scope === 'comments' && !isReply) return;

    const thr = state.cfg.thresholds || DEFAULTS.thresholds;
    const threshold = isReply ? thr.reply : thr.feedEverywhere;

    // 重复刷屏：同文本出现 >=2 次（仅文本 >=6 字时计）
    let dupBonus = 0;
    if (textKey.length >= 6) {
      const n = (state.textCount.get(textKey) || 0) + 1;
      state.textCount.set(textKey, n);
      if (n >= 2) dupBonus = 8;
    }

    // 引擎打分：文本太短时也会返回昵称硬信号（nameHard 100）
    const res = engine.scoreArticle(info, {
      isReply,
      suppressTerms: isReply ? state.suppressTerms : null,
      suppressPatterns: isReply ? state.suppressPatterns : null,
      dupBonus,
    });

    // 更新调试记录中的分数
    const last = state.processedLog[state.processedLog.length - 1];
    if (last) { last.s = res.score; last.v = res.score >= threshold ? 'HIDE' : 'keep'; }

    if (res.score >= threshold) {
      hideArticle(article, res, handle);
    } else {
      maybeDeepCheck(article, info, res.score, threshold);
    }
  }

  function pruneProcessed() {
    // 虚拟滚动会移除元素，清理 Map 防内存泄漏
    if (state.processedText.size < 400) return;
    for (const [el] of state.processedText) {
      if (!el.isConnected) state.processedText.delete(el);
    }
  }

  // ========== 配置变更后全量重扫 ==========
  let rescanTimer = null;
  function scheduleRescan() {
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => {
      rescanTimer = null;
      try { rescanAll(); } catch (e) {
        state.errors.push('rescan: ' + (e && e.message ? e.message : String(e)));
      }
    }, 300);
  }

  function rescanAll() {
    // 恢复所有已隐藏（含 cell 容器），清空处理状态，按新配置重新判定
    for (const el of document.querySelectorAll('.xcpo-hidden')) {
      el.classList.remove('xcpo-hidden');
      el.removeAttribute('aria-hidden');
    }
    state.hidden.clear();
    state.hiddenCount = 0;
    state.recent = [];
    state.processedText.clear();
    state.textCount.clear();
    state.suppressTerms = null;
    state.suppressPatterns = null;
    state.mainStatus = null;
    scan();
  }

  function scan() {
    state.scanQueued = false;
    state.scanCount++;
    try {
      updateContext();
      const articles = document.querySelectorAll(TWEET_SEL);
      for (const a of articles) processArticle(a);
      reapplyHides();
      pruneProcessed();
    } catch (e) {
      state.errors.push('scan: ' + (e && e.message ? e.message : String(e)));
    }
  }

  function scheduleScan() {
    if (state.scanQueued) return;
    state.scanQueued = true;
    requestAnimationFrame(scan);
  }

  // ========== 统计 ==========
  function markStatsDirty() {
    if (state.statsDirty) return;
    state.statsDirty = true;
    setTimeout(() => {
      state.statsDirty = false;
      try {
        chrome.runtime.sendMessage({ type: 'xcpoStats', count: state.hiddenCount });
        chrome.storage.local.set({ xcpoLast: { count: state.hiddenCount, recent: state.recent, time: Date.now() } });
      } catch (e) { /* ignore */ }
    }, 800);
  }

  // ========== 消息 ==========
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (msg && msg.type === 'xcpoGetStats') {
        sendResponse({ count: state.hiddenCount, recent: state.recent, config: state.cfg });
      } else if (msg && msg.type === 'xcpoReveal' && typeof msg.index === 'number') {
        const entry = state.recent[msg.index];
        if (entry) {
          for (const [el, info] of state.hidden.entries()) {
            if (info.snippet === entry.snippet && info.handle === entry.handle) {
              el.classList.remove('xcpo-hidden');
              el.removeAttribute('aria-hidden');
              const cell = el.closest('[data-testid="cellInnerDiv"]');
              if (cell) cell.classList.remove('xcpo-hidden');
              state.hidden.delete(el);
              state.hiddenCount = Math.max(0, state.hiddenCount - 1);
              break;
            }
          }
          state.recent.splice(msg.index, 1);
          markStatsDirty();
        }
        sendResponse({ ok: true });
      } else if (msg && msg.type === 'xcpoScan') {
        scan();
        sendResponse({ ok: true });
      }
    } catch (e) { /* ignore */ }
    return true;
  });

  // ========== 启动 ==========
  function boot() {
    state.booted = true;
    injectStyle();
    scan();
    exposeDebug();
    const mo = new MutationObserver(() => scheduleScan());
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    // SPA 路由变化（pushState）时重扫
    const patch = (type) => {
      const orig = history[type];
      return function (...args) {
        const r = orig.apply(this, args);
        setTimeout(scan, 120);
        return r;
      };
    };
    history.pushState = patch('pushState');
    history.replaceState = patch('replaceState');
    window.addEventListener('popstate', () => setTimeout(scan, 120));
    // 兜底：X 虚拟滚动频繁重建，定期补扫
    setInterval(scan, 4000);
    // 页内设置变化即时生效
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scan(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
