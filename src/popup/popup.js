/**
 * OmniLens - Action Popup Controller
 * Shows tab metrics and launches the side panel.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const tabTitle = document.getElementById('tab-title');
  const tabUrl = document.getElementById('tab-url');
  const statScore = document.getElementById('stat-score');
  const statIssues = document.getElementById('stat-issues');
  const statAssets = document.getElementById('stat-assets');
  const btnOpenPanel = document.getElementById('btn-open-panel');

  if (typeof chrome === 'undefined' || !chrome.tabs) {
    tabTitle.textContent = 'Standalone Mode';
    tabUrl.textContent = 'http://localhost:3000';
    statScore.textContent = '95';
    statIssues.textContent = '1';
    statAssets.textContent = '8';
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    tabTitle.textContent = 'No tab active';
    return;
  }

  tabTitle.textContent = tab.title || 'Untitled Tab';
  tabUrl.textContent = tab.url || 'about:blank';

  // Open Side Panel Trigger
  btnOpenPanel.addEventListener('click', async () => {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    } catch (err) {
      console.error('Error opening side panel:', err);
    }
  });

  // Query Content Script for quick snapshot
  if (!tab.url?.startsWith('chrome://') && !tab.url?.startsWith('chrome-extension://')) {
    try {
      let res = null;
      try {
        res = await chrome.tabs.sendMessage(tab.id, { type: 'INSPECT_PAGE' });
      } catch {
        // Content script might need injection
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content/content-script.js']
        });
        res = await chrome.tabs.sendMessage(tab.id, { type: 'INSPECT_PAGE' });
      }

      if (res && res.data) {
        const { a11y, assets } = res.data;
        statScore.textContent = a11y.score;
        statIssues.textContent = a11y.issues.length;
        statAssets.textContent = (assets.images.length + assets.svgs.length);
      }
    } catch {
      statScore.textContent = '--';
      statIssues.textContent = '0';
      statAssets.textContent = '0';
    }
  } else {
    statScore.textContent = 'N/A';
    statIssues.textContent = '0';
    statAssets.textContent = '0';
  }
});
