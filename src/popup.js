/**
 * XCPO 弹窗逻辑
 * 读取本页内容脚本统计；控制开关/模式；恢复误杀。
 */
'use strict';

const $ = (id) => document.getElementById(id);

let config = { enabled: true, mode: 'hide' };

function sendToActiveTab(msg, cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (tab && tab.id != null && /^https:\/\/(x|twitter)\.com\//.test(tab.url || '')) {
      chrome.tabs.sendMessage(tab.id, msg, (resp) => {
        if (chrome.runtime.lastError) { cb && cb(null); return; }
        cb && cb(resp);
      });
    } else {
      cb && cb(null);
    }
  });
}

function renderStats(data) {
  $('count').textContent = data ? data.count : '—';
  const list = $('list');
  const recent = (data && data.recent) || [];
  if (!recent.length) {
    list.innerHTML = '<div class="empty">还没有过滤记录</div>';
    return;
  }
  list.innerHTML = '';
  recent.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'item';
    const txt = document.createElement('div');
    txt.className = 'txt';
    txt.textContent = r.snippet;
    // 内容被截断时可展开全文 + 悬停提示（便于判断是否误判）
    if (r.full && r.full.length > (r.snippet || '').length) {
      div.title = r.full;
      div.classList.add('clickable');
      txt.addEventListener('click', () => {
        const expanded = div.classList.toggle('expanded');
        const old = txt.querySelector('.full');
        if (expanded) {
          if (!old) {
            const b = document.createElement('div');
            b.className = 'full';
            b.textContent = r.full;
            const small = txt.querySelector('small');
            txt.insertBefore(b, small || null);
          }
        } else if (old) {
          old.remove();
        }
      });
    }
    const reasons = (r.reasons || []).join('、');
    const small = document.createElement('small');
    small.textContent = `${r.handle ? '@' + r.handle + ' · ' : ''}${reasons || '未知原因'}`;
    txt.appendChild(small);
    const btn = document.createElement('button');
    btn.textContent = '恢复';
    btn.title = '恢复显示这条评论（也会从列表移除）';
    btn.addEventListener('click', () => {
      sendToActiveTab({ type: 'xcpoReveal', index: i }, () => {
        renderStats({ count: data.count - 1, recent: recent.filter((_, j) => j !== i) });
      });
    });
    div.appendChild(txt);
    div.appendChild(btn);
    list.appendChild(div);
  });
}

function refresh() {
  chrome.storage.local.get('xcpoLast', (v) => {
    const last = v.xcpoLast;
    $('total').textContent = last ? last.count : '0';
    sendToActiveTab({ type: 'xcpoGetStats' }, (data) => {
      if (data) {
        renderStats(data);
        $('pageHint').textContent = '正在监听当前 X 页面';
      } else {
        renderStats(null);
        $('pageHint').textContent = '请打开 X 页面后使用';
      }
    });
  });
}

// 开关
$('enabled').addEventListener('change', (e) => {
  chrome.storage.sync.get({ config: {} }, (c) => {
    chrome.storage.sync.set({ config: { ...(c.config || {}), enabled: e.target.checked } });
  });
});

// 模式
function setMode(mode) {
  chrome.storage.sync.get({ config: {} }, (c) => {
    chrome.storage.sync.set({ config: { ...(c.config || {}), mode } });
  });
  $('modeHide').classList.toggle('on', mode === 'hide');
  $('modeDim').classList.toggle('on', mode === 'dim');
}
$('modeHide').addEventListener('click', () => setMode('hide'));
$('modeDim').addEventListener('click', () => setMode('dim'));

$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.storage.sync.get({ config: {} }, (c) => {
  config = { enabled: true, mode: 'hide', ...(c.config || {}) };
  $('enabled').checked = !!config.enabled;
  setMode(config.mode);
  refresh();
});
