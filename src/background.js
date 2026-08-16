/**
 * XCPO 后台 Service Worker（MV3）
 * 职责：维护各标签页的隐藏计数并刷新 action badge。
 */
'use strict';

const tabCounts = new Map(); // tabId -> count

function setBadge(tabId, count) {
  try {
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626', tabId });
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '', tabId });
  } catch (e) { /* ignore */ }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'xcpoStats' && sender.tab && sender.tab.id != null) {
    const n = Math.max(0, msg.count || 0);
    tabCounts.set(sender.tab.id, n);
    setBadge(sender.tab.id, n);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabCounts.delete(tabId);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  setBadge(tabId, tabCounts.get(tabId) || 0);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (c) => {
    if (!c.config) {
      chrome.storage.sync.set({ config: {} });
    }
  });
});
