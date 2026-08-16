/**
 * XCPO 选项页逻辑
 */
'use strict';

const $ = (id) => document.getElementById(id);
const DEFAULTS = window.XCPO_CONFIG.DEFAULT_CONFIG;
const BUILTIN = window.XCPO_CONFIG.KEYWORDS;

let config = JSON.parse(JSON.stringify(DEFAULTS));
let toastTimer = null;

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function load() {
  chrome.storage.sync.get({ config: DEFAULTS }, (c) => {
    config = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...(c.config || {}) };
    render();
  });
}

function save(partial) {
  config = { ...config, ...partial };
  chrome.storage.sync.set({ config }, () => toast('已保存 ✓'));
}

function render() {
  $('enabled').checked = !!config.enabled;
  $('mode').value = config.mode;
  $('scope').value = config.scope;
  $('thrReply').value = config.thresholds.reply;
  $('thrReplyV').textContent = config.thresholds.reply;
  $('thrFeed').value = config.thresholds.feed;
  $('thrFeedV').textContent = config.thresholds.feed;
  $('useEmojiNoise').checked = !!config.useEmojiNoise;
  $('useProfileCheck').checked = !!config.useProfileCheck;
  $('whitelist').value = (config.whitelist || []).join('\n');
  $('blacklist').value = (config.blacklist || []).join('\n');
  $('testThr').textContent = config.thresholds.reply;
  renderCats();
}

// ---------- 关键词 ----------
const CAT_META = {
  explicit: { label: '招嫖交易词', w: 100, hint: '明确性交易，命中即杀' },
  strong: { label: '色情广告词', w: 50, hint: '擦边交易/色情内容' },
  contact: { label: '联系方式', w: 25, hint: '微信/电报/私信等引流' },
  baitStrong: { label: '钓鱼话术', w: 14, hint: '高置信话术（我福不黑…）' },
  baitWeak: { label: '诱导话术', w: 8, hint: '泛诱导，需叠加信号' },
};

function renderCats() {
  const wrap = $('cats');
  wrap.innerHTML = '';
  for (const [cat, meta] of Object.entries(CAT_META)) {
    const div = document.createElement('div');
    div.className = 'cat';
    const h = document.createElement('h3');
    h.innerHTML = `${meta.label} <span class="w">权重 ${meta.w} · ${meta.hint}</span>`;
    const chips = document.createElement('div');
    chips.className = 'chips';

    const custom = (config.keywords && config.keywords[cat]) || [];
    const builtinSet = new Set(BUILTIN.filter((k) => k.c === cat).map((k) => k.t));
    const all = Array.from(new Set([...builtinSet, ...custom]));

    for (const term of all) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = term;
      if (custom.includes(term)) {
        const del = document.createElement('button');
        del.textContent = '×';
        del.title = '删除（内置词不可删）';
        del.addEventListener('click', () => {
          config.keywords[cat] = config.keywords[cat].filter((t) => t !== term);
          save({ keywords: config.keywords });
          renderCats();
        });
        chip.appendChild(del);
      }
      chips.appendChild(chip);
    }
    if (!all.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.style.cssText = 'color:var(--muted);font-size:12px;';
      e.textContent = '（无）';
      chips.appendChild(e);
    }

    const addRow = document.createElement('div');
    addRow.className = 'add-row';
    const input = document.createElement('input');
    input.placeholder = '添加自定义词…';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const t = input.value.trim();
        if (t) {
          config.keywords[cat] = Array.from(new Set([...(config.keywords[cat] || []), t]));
          save({ keywords: config.keywords });
          renderCats();
        }
      }
    });
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = '添加';
    btn.addEventListener('click', () => {
      const t = input.value.trim();
      if (t) {
        config.keywords[cat] = Array.from(new Set([...(config.keywords[cat] || []), t]));
        save({ keywords: config.keywords });
        renderCats();
      }
    });
    addRow.appendChild(input);
    addRow.appendChild(btn);

    div.appendChild(h);
    div.appendChild(chips);
    div.appendChild(addRow);
    wrap.appendChild(div);
  }
}

// ---------- 事件 ----------
$('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
$('mode').addEventListener('change', (e) => save({ mode: e.target.value }));
$('scope').addEventListener('change', (e) => save({ scope: e.target.value }));
$('useEmojiNoise').addEventListener('change', (e) => save({ useEmojiNoise: e.target.checked }));
$('useProfileCheck').addEventListener('change', (e) => save({ useProfileCheck: e.target.checked }));

$('thrReply').addEventListener('input', (e) => {
  $('thrReplyV').textContent = e.target.value;
  $('testThr').textContent = e.target.value;
  save({ thresholds: { ...config.thresholds, reply: +e.target.value } });
});
$('thrFeed').addEventListener('input', (e) => {
  $('thrFeedV').textContent = e.target.value;
  save({ thresholds: { ...config.thresholds, feed: +e.target.value } });
});

$('whitelist').addEventListener('change', (e) => {
  const list = e.target.value.split('\n').map((s) => s.trim().replace(/^@/, '')).filter(Boolean);
  save({ whitelist: list });
});
$('blacklist').addEventListener('change', (e) => {
  const list = e.target.value.split('\n').map((s) => s.trim().replace(/^@/, '')).filter(Boolean);
  save({ blacklist: list });
});

// ---------- 试词 ----------
const SAMPLE_ADS = [
  '应该没人比我玩的开了吧🥑🤓我福不黑不信你看',
  '比我好看的没我骚🤏🚴比我骚的没我好看',
  '我果然太涩了🌤️🍝有人想锐评一下我的福嘛',
  '加微信 138xxxx8888 全套300包夜800 上门服务',
  '私信我 发你私密照 懂的来',
];
const SAMPLE_LEGIT = [
  '支持，分析得很到位',
  '太真实了哈哈哈哈哈',
  '这波操作太骚了，稳！',
  '周末约吗？一起打羽毛球',
  '这个柿子太涩了，不过挺好吃',
  '关注公众号有详细教程',
  '我有福气遇到这么好的博主',
];

function runTest(text) {
  const engine = window.XCPO_Engine.create(config);
  const thr = config.thresholds.reply;
  const res = engine.scoreArticle({ text, name: '测试用户', handle: 'test_user_123' }, {});
  const div = $('testResult');
  div.style.display = 'block';
  const verdict = res.score >= thr
    ? `<div class="ok">🚫 会被隐藏（${res.score} ≥ ${thr}）</div>`
    : `<div class="pass">✓ 不会隐藏（${res.score} &lt; ${thr}）</div>`;
  div.innerHTML = verdict + (res.reasons.length ? '\n' + res.reasons.join('\n') : '\n（未命中任何信号）');
}

$('testBtn').addEventListener('click', () => runTest($('testText').value));
$('testExamples').addEventListener('click', () => {
  $('testText').value = SAMPLE_ADS[Math.floor(Math.random() * SAMPLE_ADS.length)];
  runTest($('testText').value);
});
$('testLegit').addEventListener('click', () => {
  $('testText').value = SAMPLE_LEGIT[Math.floor(Math.random() * SAMPLE_LEGIT.length)];
  runTest($('testText').value);
});

// ---------- 导入导出 ----------
$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'xcpo-config.json';
  a.click();
  URL.revokeObjectURL(url);
});
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      config = {
        ...JSON.parse(JSON.stringify(DEFAULTS)),
        ...data,
        thresholds: { ...JSON.parse(JSON.stringify(DEFAULTS.thresholds)), ...(data.thresholds || {}) },
        keywords: { explicit: [], strong: [], contact: [], baitStrong: [], baitWeak: [], ...(data.keywords || {}) },
        whitelist: Array.isArray(data.whitelist) ? data.whitelist : [],
        blacklist: Array.isArray(data.blacklist) ? data.blacklist : [],
      };
      chrome.storage.sync.set({ config }, () => {
        render();
        toast('导入成功 ✓');
      });
    } catch (err) {
      toast('导入失败：不是有效的 JSON');
    }
  };
  reader.readAsText(f);
  e.target.value = '';
});
$('resetBtn').addEventListener('click', () => {
  if (!confirm('确定恢复全部默认设置？自定义关键词也会清除。')) return;
  config = JSON.parse(JSON.stringify(DEFAULTS));
  chrome.storage.sync.set({ config }, () => {
    render();
    toast('已恢复默认 ✓');
  });
});

load();
