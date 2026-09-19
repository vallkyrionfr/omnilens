/**
 * OmniLens - Background Service Worker (Manifest V3)
 * Coordinates extension lifecycle, context menus, command shortcuts, badge updates, and storage persistence.
 */

// Lifecycle: On Extension Installed / Updated
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[OmniLens SW] Installed reason:', details.reason);

  // Initialize persistent default configuration in chrome.storage.local
  const existing = await chrome.storage.local.get(['settings', 'snippets']);
  if (!existing.settings) {
    await chrome.storage.local.set({
      settings: {
        theme: 'dark',
        autoAudit: true,
        highlightElements: true,
        maxHarvestItems: 100
      }
    });
  }

  if (!existing.snippets) {
    await chrome.storage.local.set({
      snippets: [
        {
          id: 'snip-1',
          title: 'Count All Images',
          code: 'console.log("Total images:", document.querySelectorAll("img").length);'
        },
        {
          id: 'snip-2',
          title: 'Extract Page Links',
          code: 'const links = Array.from(document.querySelectorAll("a[href]")).map(a => a.href);\nconsole.table(links.slice(0, 10));'
        }
      ]
    });
  }

  // Register Context Menus
  chrome.contextMenus.removeAll(async () => {
    chrome.contextMenus.create({
      id: 'omnilens-open-panel',
      title: 'OmniLens: Open Side Panel',
      contexts: ['all']
    });

    chrome.contextMenus.create({
      id: 'omnilens-save-selection',
      title: 'OmniLens: Add Selection to Scratchpad',
      contexts: ['selection']
    });
  });

  // Set default badge styling
  await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
});

// Context Menu Action Handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === 'omnilens-open-panel') {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } else if (info.menuItemId === 'omnilens-save-selection') {
    const selectedText = info.selectionText || '';
    if (selectedText) {
      const { snippets = [] } = await chrome.storage.local.get('snippets');
      const newSnippet = {
        id: `snip-${Date.now()}`,
        title: `Captured: ${selectedText.slice(0, 25)}...`,
        code: `// Selected Text:\n/*\n${selectedText}\n*/`
      };
      await chrome.storage.local.set({ snippets: [newSnippet, ...snippets] });

      // Visual feedback via badge flash
      await chrome.action.setBadgeText({ tabId: tab.id, text: 'SAVED' });
      await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });

      // Reset badge after 2 seconds
      chrome.alarms.create(`reset-badge-${tab.id}`, { delayInMinutes: 0.05 });
    }
  }
});

// Alarm Handler (e.g. badge reset)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('reset-badge-')) {
    const tabId = parseInt(alarm.name.replace('reset-badge-', ''), 10);
    try {
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
    } catch {
      // Tab may be closed
    }
  }
});

// Keyboard Commands Handler
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open_omnilens') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  }
});

// Central Runtime Message Hub
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Wrap async operations
  (async () => {
    try {
      switch (message.type) {
        case 'UPDATE_BADGE': {
          const tabId = sender.tab ? sender.tab.id : message.tabId;
          if (tabId && message.text !== undefined) {
            await chrome.action.setBadgeText({ tabId, text: String(message.text) });
            if (message.color) {
              await chrome.action.setBadgeBackgroundColor({ color: message.color });
            }
          }
          sendResponse({ success: true });
          break;
        }

        case 'OPEN_SIDE_PANEL': {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab && activeTab.windowId) {
            await chrome.sidePanel.open({ windowId: activeTab.windowId });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No active window found' });
          }
          break;
        }

        case 'GET_ACTIVE_TAB': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          sendResponse({ tab });
          break;
        }

        default:
          sendResponse({ error: 'Unknown message type' });
          break;
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();

  return true; // Keep message port open for async response
});
