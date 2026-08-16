/**
 * XCPO 检测引擎 —— 纯逻辑，无 DOM 依赖，浏览器/Node 通用。
 *
 * 用法：
 *   const engine = XCPO_Engine.create(config?)   // config 可省略，用默认
 *   const res = engine.scoreArticle({ text, name, handle }, {
 *     isReply, suppressTerms, suppressPatterns, dupBonus, useEmojiNoise,
 *   });
 *   res = { score, hits: [{type, term, w, cat?}], reasons: [...] }
 *   当 score >= threshold 时隐藏。threshold 由调用方（content.js）根据上下文决定。
 */
(function (global) {
  'use strict';

  const CFG = global.XCPO_CONFIG || {};

  const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{1FA70}-\u{1FAFF}\u{1FB00}-\u{1FBFF}\u{FE00}-\u{FE0F}\u{200D}]/gu;
  const WS_RE = /\s+/g;

  const CAT_LABEL = {
    explicit: '招嫖交易词',
    strong: '色情广告词',
    contact: '联系方式',
    baitStrong: '钓鱼话术',
    baitWeak: '诱导话术',
    pattern: '规则命中',
    noise: 'emoji 干扰',
    account: '账号风险',
    dup: '重复刷屏',
    profile: '主页风险',
    nameHard: '昵称广告词',
  };

  function cleanText(s) {
    return String(s || '').replace(EMOJI_RE, '').replace(WS_RE, '');
  }

  function countEmojis(s) {
    const m = String(s || '').match(EMOJI_RE);
    return m ? m.length : 0;
  }

  /** emoji 插入在 CJK 之间的次数（"吧🥑🤓我" 算 1 处） */
  function countInterleavedEmojis(s) {
    const m = String(s || '').match(/[\u3400-\u9FFF\uF900-\uFAFF][\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]{1,3}[\u3400-\u9FFF\uF900-\uFAFF]/gu);
    return m ? m.length : 0;
  }

  function normalizeHandle(h) {
    return String(h || '').trim().replace(/^@/, '').toLowerCase();
  }

  /** 把用户自定义关键词并入默认表，去重 */
  function mergeCustomKeywords(base, custom) {
    const out = base.slice();
    const seen = new Set(base.map((k) => k.t));
    for (const cat of ['explicit', 'strong', 'contact', 'baitStrong', 'baitWeak']) {
      const ws = { explicit: 100, strong: 50, contact: 25, baitStrong: 14, baitWeak: 8 };
      const list = (custom && custom[cat]) || [];
      for (const t of list) {
        const term = String(t).trim();
        if (!term || seen.has(term)) continue;
        seen.add(term);
        out.push({ t: term, w: ws[cat], c: cat });
      }
    }
    return out;
  }

  function create(config) {
    const cfg = config || {};
    const keywords = mergeCustomKeywords(CFG.KEYWORDS || [], cfg.keywords);
    const patterns = (CFG.PATTERNS || []).map((p) => ({ ...p }));

    function matchTerms(text) {
      const hits = [];
      for (const k of keywords) {
        if (text.includes(k.t)) hits.push({ t: k.t, w: k.w, c: k.c });
      }
      return hits;
    }

    function matchPatterns(text) {
      const hits = [];
      for (const p of patterns) {
        p.re.lastIndex = 0;
        if (p.re.test(text)) hits.push({ id: p.id, w: p.w, label: p.label });
      }
      return hits;
    }

    /**
     * 纯文本评分。返回 { score, hits, reasons }
     * opts: { suppressTerms:Set, suppressPatterns:Set, useEmojiNoise, name, handle, dupBonus }
     */
    function scoreText(text, opts) {
      opts = opts || {};
      const raw = String(text || '');
      const cleaned = cleanText(raw);

      const hits = [];
      const reasons = [];
      const suppressTerms = opts.suppressTerms || null;
      const suppressPatterns = opts.suppressPatterns || null;

      // 0) 账号信号（昵称/ID）——独立于评论文本：昵称是广告，评论再短也杀
      const name = opts.name || '';
      const cleanName = cleanText(name);
      if (cleanName && cleanName.length >= 2) {
        for (const t of CFG.NAME_HARD_TERMS || []) {
          if (cleanName.includes(t)) {
            hits.push({ type: 'nameHard', term: t, w: 100, cat: 'nameHard' });
            break;
          }
        }
      }
      let acc = 0;
      const accBits = [];
      for (const sig of CFG.NAME_SIGNALS || []) {
        if (sig.re.test(name)) { acc += sig.w; accBits.push(sig.label); }
      }
      const handle = opts.handle || '';
      if (/^\d{5,15}$/.test(handle)) { acc += 4; accBits.push('纯数字 ID'); }
      if (/(福利|涩|骚|薇|援交|裸|onlyfans)/i.test(handle)) { acc += 3; accBits.push('ID 敏感词'); }
      if (acc > 0) {
        acc = Math.min(acc, 10);
        hits.push({ type: 'account', term: accBits.join('+'), w: acc });
      }

      if (cleaned.length < 2) {
        const score = hits.reduce((s, h) => s + h.w, 0);
        return { score, hits, reasons: buildReasons(hits) };
      }

      // 1) 关键词：原始文本 + 去 emoji/空格后的文本（抓"玩 的 开""吧🥑我"这类变形）
      const rawTerms = matchTerms(raw);
      const cleanTerms = matchTerms(cleaned);
      const termMap = new Map();
      for (const t of rawTerms) termMap.set(t.t, t);
      for (const t of cleanTerms) if (!termMap.has(t.t)) termMap.set(t.t, t);
      for (const t of termMap.values()) {
        if (suppressTerms && suppressTerms.has(t.t)) continue; // 话题抑制
        hits.push({ type: 'keyword', term: t.t, w: t.w, cat: t.c });
      }

      // 2) 正则规则
      const patHits = matchPatterns(cleaned);
      for (const p of patHits) {
        if (suppressPatterns && suppressPatterns.has(p.id)) continue;
        hits.push({ type: 'pattern', term: p.id, w: p.w, label: p.label });
      }

      // 3) emoji 干扰
      if (opts.useEmojiNoise !== false) {
        const em = countEmojis(raw);
        const inter = countInterleavedEmojis(raw);
        const lenNoEmoji = raw.replace(EMOJI_RE, '').trim().length;
        let noise = 0;
        const bits = [];
        if (inter >= 2) { noise += 6; bits.push('句中插 emoji'); }
        if (em >= 4 && lenNoEmoji <= 80) { noise += 4; bits.push('大量 emoji'); }
        if (noise > 0 && lenNoEmoji >= 4) {
          hits.push({ type: 'noise', term: bits.join('+'), w: noise });
        }
      }

      // 5) 重复刷屏加分
      if (opts.dupBonus) {
        hits.push({ type: 'dup', term: '相似内容重复出现', w: opts.dupBonus });
      }

      // 6) 计算总分与原因
      const score = hits.reduce((s, h) => s + h.w, 0);
      return { score, hits, reasons: buildReasons(hits) };
    }

    function buildReasons(hits) {
      const reasons = [];
      for (const h of hits) {
        const label = h.type === 'keyword' ? CAT_LABEL[h.cat] || h.cat : h.type === 'pattern' ? (h.label || h.term) : CAT_LABEL[h.type] || h.type;
        reasons.push(`[+${h.w}] ${label}「${h.term}」`);
      }
      return reasons;
    }

    /**
     * 评论文章评分。info: { text, name, handle }
     * ctx: { isReply, suppressTerms, suppressPatterns, useEmojiNoise, dupBonus }
     */
    function scoreArticle(info, ctx) {
      ctx = ctx || {};
      const res = scoreText(info.text, {
        useEmojiNoise: ctx.useEmojiNoise !== false,
        suppressTerms: ctx.suppressTerms || null,
        suppressPatterns: ctx.suppressPatterns || null,
        name: info.name,
        handle: info.handle,
        dupBonus: ctx.dupBonus || 0,
      });
      return res;
    }

    /**
     * 主页深查：分析 bio（name + description + url）
     * 返回 { bonus, reasons }，bonus 是叠加到评论分的加分
     */
    function profileBonus(profile, opts) {
      opts = opts || {};
      const rules = CFG.PROFILE_RULES || {};
      const text = [profile.name, profile.description].join(' ');
      const cleaned = cleanText(text);
      const bioRes = scoreText(cleaned, { useEmojiNoise: false, name: profile.name, handle: profile.screen_name });
      const strongHits = bioRes.hits.filter((h) => h.w >= (rules.bioHitMinWeight || 25));
      let bonus = 0;
      const reasons = [];
      if (strongHits.length > 0) { bonus += 15; reasons.push('主页简介含敏感内容'); }
      const url = (profile.entities && profile.entities.url && profile.entities.url.urls && profile.entities.url.urls[0] && profile.entities.url.urls[0].expanded_url) || '';
      if (url) {
        if (/(onlyfans|fansly|91porn|xvideos|pornhub|nhentai|jable|chaturbate|stripchat|telegram|t\.me)/i.test(url)) {
          bonus += (rules.adultUrlBonus || 20); reasons.push('主页外链为成人/引流域名');
        } else if (/(bit\.ly|tinyurl|goo\.gl|cutt\.ly|suo\.im|dwz\.cn|t\.cn)\//i.test(url)) {
          bonus += (rules.shortenerBonus || 10); reasons.push('主页外链为短链');
        }
      }
      let createdAt = 0;
      if (profile.created_at) createdAt = Date.parse(profile.created_at);
      if (createdAt && (Date.now() - createdAt) < (rules.newAccountDays || 45) * 864e5) {
        bonus += 8; reasons.push('注册时间很短');
      }
      return { bonus, reasons };
    }

    return { scoreText, scoreArticle, profileBonus, cleanText, countEmojis, normalizeHandle };
  }

  const api = { create, cleanText, CAT_LABEL, normalizeHandle };
  global.XCPO_Engine = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
