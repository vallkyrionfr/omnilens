/**
 * OmniLens - Side Panel Controller
 * Handles tab monitoring, page inspection, interactive element picking, and sandbox execution.
 */

import { parseColor, getContrastRatio, evaluateWcag } from '../core/colors.js';

// Application State
const state = {
  activeTab: null,
  pageData: null,
  selectedColor: '#f4f3ee',
  inspectMode: false,
  assetFilter: 'all',
  assetSearchQuery: '',
  pendingSandboxExecutions: new Map()
};

// DOM Elements Cache
const elements = {
  pageTitle: document.getElementById('page-title'),
  pageUrl: document.getElementById('page-url'),
  pageStatusDot: document.querySelector('.page-status-dot'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnInspectMode: document.getElementById('btn-inspect-mode'),
  tabButtons: document.querySelectorAll('.tab-btn'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  toast: document.getElementById('toast'),

  // Audit
  a11yScoreVal: document.getElementById('a11y-score-val'),
  a11yScoreRing: document.getElementById('a11y-score-ring'),
  metricNodes: document.getElementById('metric-nodes'),
  metricDepth: document.getElementById('metric-depth'),
  metricHeadings: document.getElementById('metric-headings'),
  techStackContainer: document.getElementById('tech-stack-container'),
  issueCountBadge: document.getElementById('issue-count-badge'),
  issuesList: document.getElementById('issues-list'),
  headingsOutline: document.getElementById('headings-outline'),

  // Palette
  paletteGrid: document.getElementById('palette-grid'),
  contrastPreviewFg: document.getElementById('contrast-preview-fg'),
  contrastPreviewBg: document.getElementById('contrast-preview-bg'),
  contrastVal: document.getElementById('contrast-val'),
  contrastLevelBadge: document.getElementById('contrast-level-badge'),
  btnCopyCssVars: document.getElementById('btn-copy-css-vars'),
  fontsList: document.getElementById('fonts-list'),

  // Harvester
  filterChips: document.querySelectorAll('.filter-chip'),
  assetSearch: document.getElementById('asset-search'),
  assetsGrid: document.getElementById('assets-grid'),

  // Reader
  readTime: document.getElementById('read-time'),
  readWords: document.getElementById('read-words'),
  readLevel: document.getElementById('read-level'),
  readerKeywords: document.getElementById('reader-keywords'),
  readerArticleContent: document.getElementById('reader-article-content'),
  btnCopyReader: document.getElementById('btn-copy-reader'),

  // Scratchpad
  snippetSelect: document.getElementById('snippet-select'),
  btnSaveSnippet: document.getElementById('btn-save-snippet'),
  codeEditor: document.getElementById('code-editor'),
  btnRunSandbox: document.getElementById('btn-run-sandbox'),
  btnQueryPage: document.getElementById('btn-query-page'),
  btnClearConsole: document.getElementById('btn-clear-console'),
  consoleOutput: document.getElementById('console-output'),
  execTime: document.getElementById('exec-time'),
  sandboxFrame: document.getElementById('sandbox-frame')
};

// Lifecycle Boot
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigationTabs();
  setupSandboxMessaging();
  setupScratchpad();
  setupEvents();
  setupTabLifecycleListeners();
  await loadCurrentPageData();
});

// Real-Time Tab Lifecycle Observers (auto-updates when user navigates or switches tabs)
function setupTabLifecycleListeners() {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;

  // Active tab changed
  chrome.tabs.onActivated.addListener(async () => {
    await loadCurrentPageData();
  });

  // Tab updated (navigation, page reload)
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.status === 'complete') {
      await loadCurrentPageData();
    }
  });

  // Listen for messages from content script (e.g. element picked)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'ELEMENT_PICKED') {
      onElementPicked(message.data);
    } else if (message.type === 'PICKER_STATUS_CHANGED') {
      state.inspectMode = message.active;
      elements.btnInspectMode.classList.toggle('active', state.inspectMode);
    }
  });
}

// Navigation Tabs Handling
function setupNavigationTabs() {
  elements.tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.dataset.tab;
      elements.tabButtons.forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      elements.tabPanes.forEach(pane => {
        pane.classList.toggle('active', pane.id === targetTabId);
      });
    });
  });
}

// Event Listeners
function setupEvents() {
  elements.btnRefresh.addEventListener('click', async () => {
    elements.btnRefresh.style.transform = 'rotate(180deg)';
    await loadCurrentPageData();
    setTimeout(() => { elements.btnRefresh.style.transform = ''; }, 300);
  });

  // Element Picker Trigger
  elements.btnInspectMode.addEventListener('click', async () => {
    state.inspectMode = !state.inspectMode;
    elements.btnInspectMode.classList.toggle('active', state.inspectMode);

    if (state.activeTab?.id) {
      try {
        await chrome.tabs.sendMessage(state.activeTab.id, {
          type: state.inspectMode ? 'START_ELEMENT_PICKER' : 'STOP_ELEMENT_PICKER'
        });
        showToast(state.inspectMode ? 'Click any element on the page to inspect' : 'Inspector closed');
      } catch (err) {
        showToast('Cannot inspect this page');
      }
    } else {
      showToast('No active tab to inspect');
    }
  });

  // Asset Filter chips
  elements.filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      elements.filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.assetFilter = chip.dataset.filter;
      renderAssets();
    });
  });

  // Asset Search
  elements.assetSearch.addEventListener('input', (e) => {
    state.assetSearchQuery = e.target.value.toLowerCase().trim();
    renderAssets();
  });

  // Copy CSS Variables
  elements.btnCopyCssVars.addEventListener('click', () => {
    if (!state.pageData?.palette?.colors) return;
    const vars = state.pageData.palette.colors.map((c, i) => `  --color-${i + 1}: ${c.hex};`).join('\n');
    const cssText = `:root {\n${vars}\n}`;
    navigator.clipboard.writeText(cssText);
    showToast('Copied CSS Variables');
  });

  // Copy Clean Reader Text
  elements.btnCopyReader.addEventListener('click', () => {
    if (!state.pageData?.reader?.paragraphs) return;
    const fullText = state.pageData.reader.paragraphs.map(p => p.text).join('\n\n');
    navigator.clipboard.writeText(fullText);
    showToast('Article text copied');
  });
}

// When an element is picked in-page
function onElementPicked(data) {
  state.inspectMode = false;
  elements.btnInspectMode.classList.remove('active');

  showToast(`Inspected <${data.tag}>`);

  // Switch to palette tab and update contrast inspector with element's color
  if (data.style?.color) {
    updateContrastInspector(data.style.color);
  }

  // Add a dedicated inspected element finding in issues list
  const inspectedCard = document.createElement('div');
  inspectedCard.className = 'issue-item';
  inspectedCard.style.borderColor = '#f4f3ee';
  inspectedCard.innerHTML = `
    <div class="issue-header">
      <span class="badge" style="color:#f4f3ee; border-color:#f4f3ee;">SELECTED ELEMENT</span>
      <span style="font-family:var(--font-mono); font-size:10px; color:#71717a;">${data.rect.width}×${data.rect.height}px</span>
    </div>
    <div class="issue-msg"><strong>&lt;${data.tag}&gt;</strong> ${data.text ? `"${data.text}"` : ''}</div>
    <div style="font-family:var(--font-mono); font-size:10px; color:#a1a1aa;">Font: ${data.style.fontFamily?.split(',')[0]} (${data.style.fontSize})</div>
    <span class="issue-selector">Selector: ${data.selector}</span>
  `;

  inspectedCard.querySelector('.issue-selector').addEventListener('click', async () => {
    if (state.activeTab?.id) {
      await chrome.tabs.sendMessage(state.activeTab.id, {
        type: 'HIGHLIGHT_ELEMENT',
        selector: data.selector,
        label: `Selected: <${data.tag}>`
      });
    }
  });

  elements.issuesList.prepend(inspectedCard);
}

// Active Tab Data Loader
async function loadCurrentPageData() {
  // If running in standalone browser preview (outside extension runtime)
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    loadMockDemoData('Standalone Preview');
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      elements.pageTitle.textContent = 'No tab active';
      elements.pageStatusDot.classList.remove('active');
      return;
    }

    state.activeTab = tab;
    elements.pageTitle.textContent = tab.title || 'Untitled Tab';
    elements.pageUrl.textContent = tab.url || 'about:blank';

    // Restricted browser internal pages
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://') || tab.url?.startsWith('chrome-extension://')) {
      elements.pageTitle.textContent = 'Internal Browser Page';
      elements.pageUrl.textContent = 'Restricted page (extensions cannot inspect chrome://)';
      elements.pageStatusDot.classList.remove('active');
      loadMockDemoData(tab.title || 'Browser Internal');
      return;
    }

    elements.pageStatusDot.classList.add('active');

    let response = null;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'INSPECT_PAGE' });
    } catch {
      // Content script may need injection
      try {
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['src/content/content-style.css']
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content/content-script.js']
        });
        response = await chrome.tabs.sendMessage(tab.id, { type: 'INSPECT_PAGE' });
      } catch (injectErr) {
        console.warn('Could not inject content script:', injectErr);
      }
    }

    if (response && response.data) {
      state.pageData = response.data;
      renderAll();
    } else {
      loadMockDemoData(tab.title || 'Active Tab');
    }
  } catch (err) {
    console.error('Error loading tab:', err);
    loadMockDemoData('Inspection Fallback');
  }
}

// Fallback & Demo Data Provider
function loadMockDemoData(title) {
  state.pageData = {
    metadata: {
      title,
      url: window.location.href,
      description: 'OmniLens test & demonstration session'
    },
    domMetrics: {
      totalNodes: 842,
      maxDepth: 14,
      tagDistribution: { div: 220, a: 110, p: 45, span: 90, img: 12 }
    },
    headings: {
      items: [
        { level: 1, tag: 'h1', text: 'OmniLens Intelligence Test' },
        { level: 2, tag: 'h2', text: 'System Architecture' },
        { level: 3, tag: 'h3', text: 'Engine Performance' }
      ],
      warnings: [],
      h1Count: 1
    },
    techStack: [
      { name: 'Manifest V3', category: 'Platform' },
      { name: 'ES Modules', category: 'Standard' },
      { name: 'Vanilla JS', category: 'Runtime' }
    ],
    a11y: {
      score: 92,
      issues: [
        {
          type: 'low-contrast',
          severity: 'moderate',
          message: 'Subtle text contrast: 3.8:1 on navigation labels (recommended >= 4.5:1).',
          selector: 'nav a.subtle-link'
        },
        {
          type: 'image-alt',
          severity: 'serious',
          message: 'Footer brand icon missing explicit alt attribute.',
          selector: 'footer img.brand'
        }
      ],
      summary: { critical: 0, serious: 1, moderate: 1, total: 2 }
    },
    palette: {
      colors: [
        { hex: '#09090b', raw: 'rgb(9, 9, 11)', count: 48 },
        { hex: '#f4f3ee', raw: 'rgb(244, 243, 238)', count: 35 },
        { hex: '#18181b', raw: 'rgb(24, 24, 27)', count: 28 },
        { hex: '#a1a1aa', raw: 'rgb(161, 161, 170)', count: 22 },
        { hex: '#27272a', raw: 'rgb(39, 39, 42)', count: 18 },
        { hex: '#4ade80', raw: 'rgb(74, 222, 128)', count: 6 },
        { hex: '#fbbf24', raw: 'rgb(251, 191, 36)', count: 4 },
        { hex: '#fb7185', raw: 'rgb(251, 113, 133)', count: 3 }
      ],
      fonts: [
        { name: 'ui-monospace', count: 18 },
        { name: '-apple-system', count: 42 },
        { name: 'Inter', count: 24 }
      ]
    },
    assets: {
      images: [
        { id: 'img-1', src: '../../icons/icon-128.png', width: 128, height: 128, alt: 'OmniLens Icon' },
        { id: 'img-2', src: '../../icons/icon-48.png', width: 48, height: 48, alt: 'OmniLens Small' }
      ],
      svgs: [
        {
          id: 'svg-1',
          title: 'Aperture Lens Icon',
          code: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f4f3ee" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>'
        }
      ],
      links: [
        { id: 'link-1', href: 'https://developer.chrome.com/docs/extensions/mv3/', text: 'Chrome MV3 Documentation', isExternal: true },
        { id: 'link-2', href: 'http://localhost:3000/testbed/index.html', text: 'Local Testbed Playground', isExternal: false }
      ],
      stats: { totalImages: 2, totalSvgs: 1, totalLinks: 2 }
    },
    reader: {
      wordCount: 420,
      readingTime: 2,
      readingLevel: 'Standard',
      topKeywords: [
        { word: 'extension', count: 14 },
        { word: 'browser', count: 10 },
        { word: 'contrast', count: 8 },
        { word: 'palette', count: 6 }
      ],
      paragraphs: [
        { tag: 'p', text: 'OmniLens runs high-frequency DOM, layout, and contrast analysis directly inside the browser viewport.' },
        { tag: 'p', text: 'By utilizing native Web APIs and batched requestAnimationFrame schedules, the engine minimizes overhead while rendering instantaneous reports.' }
      ]
    }
  };

  renderAll();
}

// Master Render Method
function renderAll() {
  if (!state.pageData) return;
  renderAudit();
  renderPalette();
  renderAssets();
  renderReader();
}

// 1. Render Audit View
function renderAudit() {
  const { domMetrics, headings, techStack, a11y } = state.pageData;

  // A11y Score Ring
  elements.a11yScoreVal.textContent = a11y.score;
  const ringColor = a11y.score >= 80 ? '#f4f3ee' : a11y.score >= 50 ? '#fbbf24' : '#fb7185';
  elements.a11yScoreRing.style.borderColor = ringColor;
  elements.a11yScoreRing.style.color = ringColor;

  // Key Metrics
  elements.metricNodes.textContent = domMetrics.totalNodes.toLocaleString();
  elements.metricDepth.textContent = domMetrics.maxDepth;
  elements.metricHeadings.textContent = headings.items.length;

  // Tech Stack
  elements.techStackContainer.innerHTML = '';
  if (techStack.length === 0) {
    elements.techStackContainer.innerHTML = '<span class="chip-empty">No standard framework detected</span>';
  } else {
    techStack.forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = `${t.name}`;
      elements.techStackContainer.appendChild(chip);
    });
  }

  // Findings / Issues
  elements.issueCountBadge.textContent = `${a11y.issues.length} Issues`;
  elements.issueCountBadge.className = `badge ${a11y.issues.length > 5 ? 'critical' : a11y.issues.length > 0 ? 'serious' : ''}`;

  elements.issuesList.innerHTML = '';
  if (a11y.issues.length === 0) {
    elements.issuesList.innerHTML = '<div class="empty-state">No accessibility or structural issues detected.</div>';
  } else {
    a11y.issues.forEach(issue => {
      const item = document.createElement('div');
      item.className = 'issue-item';

      const header = document.createElement('div');
      header.className = 'issue-header';
      header.innerHTML = `
        <span class="badge ${issue.severity}">${issue.severity.toUpperCase()}</span>
      `;

      const msg = document.createElement('div');
      msg.className = 'issue-msg';
      msg.textContent = issue.message;

      item.appendChild(header);
      item.appendChild(msg);

      if (issue.selector) {
        const selectorBtn = document.createElement('span');
        selectorBtn.className = 'issue-selector';
        selectorBtn.textContent = `Inspect: ${issue.selector}`;
        selectorBtn.addEventListener('click', async () => {
          if (state.activeTab?.id) {
            await chrome.tabs.sendMessage(state.activeTab.id, {
              type: 'HIGHLIGHT_ELEMENT',
              issueId: issue.id,
              uniqueSelector: issue.uniqueSelector,
              selector: issue.selector,
              label: issue.message.slice(0, 45)
            });
            showToast('Element highlighted on page');
          }
        });
        item.appendChild(selectorBtn);
      }

      elements.issuesList.appendChild(item);
    });
  }

  // Heading Structure
  elements.headingsOutline.innerHTML = '';
  if (headings.items.length === 0) {
    elements.headingsOutline.innerHTML = '<div class="empty-state">No headings found.</div>';
  } else {
    headings.items.forEach(h => {
      const row = document.createElement('div');
      row.className = 'outline-item';
      row.style.paddingLeft = `${(h.level - 1) * 10}px`;
      row.innerHTML = `
        <span class="heading-tag">${h.tag}</span>
        <span class="heading-text">${h.text || '[Empty Heading]'}</span>
      `;
      elements.headingsOutline.appendChild(row);
    });
  }
}

// 2. Render Palette & Typography
function renderPalette() {
  const { palette } = state.pageData;
  if (!palette || !palette.colors) return;

  elements.paletteGrid.innerHTML = '';
  palette.colors.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'swatch-card';
    card.style.backgroundColor = c.hex;
    card.title = `${c.hex} (${c.count} uses) - Click to inspect`;

    card.addEventListener('click', () => {
      state.selectedColor = c.hex;
      updateContrastInspector(c.hex);
      navigator.clipboard.writeText(c.hex);
      showToast(`Copied ${c.hex}`);
    });

    elements.paletteGrid.appendChild(card);
  });

  if (palette.colors.length > 0) {
    updateContrastInspector(palette.colors[0].hex);
  }

  // Render fonts
  elements.fontsList.innerHTML = '';
  if (palette.fonts && palette.fonts.length > 0) {
    palette.fonts.forEach(f => {
      const item = document.createElement('div');
      item.className = 'font-item';
      item.innerHTML = `
        <span style="font-family: ${f.name}, sans-serif;">${f.name}</span>
        <span class="badge">${f.count} uses</span>
      `;
      elements.fontsList.appendChild(item);
    });
  } else {
    elements.fontsList.innerHTML = '<div class="empty-state">No fonts detected.</div>';
  }
}

function updateContrastInspector(hex) {
  elements.contrastPreviewFg.style.backgroundColor = hex;
  const darkBg = '#09090b';
  const ratio = getContrastRatio(hex, darkBg) || 1;
  const evalResult = evaluateWcag(ratio);

  elements.contrastVal.textContent = ratio.toFixed(2);
  elements.contrastLevelBadge.textContent = evalResult.level;
  elements.contrastLevelBadge.className = `badge ${evalResult.aaNormal ? 'moderate' : 'critical'}`;
}

// 3. Render Asset Harvester
function renderAssets() {
  const { assets } = state.pageData;
  if (!assets) return;

  elements.assetsGrid.innerHTML = '';
  let items = [];

  if (state.assetFilter === 'all' || state.assetFilter === 'image') {
    items = items.concat(assets.images.map(img => ({ ...img, itemType: 'image' })));
  }
  if (state.assetFilter === 'all' || state.assetFilter === 'svg') {
    items = items.concat(assets.svgs.map(svg => ({ ...svg, itemType: 'svg' })));
  }
  if (state.assetFilter === 'all' || state.assetFilter === 'link') {
    items = items.concat(assets.links.map(link => ({ ...link, itemType: 'link' })));
  }

  // Filter by search query
  if (state.assetSearchQuery) {
    items = items.filter(item => {
      const text = `${item.src || ''} ${item.title || ''} ${item.href || ''} ${item.text || ''}`.toLowerCase();
      return text.includes(state.assetSearchQuery);
    });
  }

  if (items.length === 0) {
    elements.assetsGrid.innerHTML = '<div class="empty-state">No matching assets found.</div>';
    return;
  }

  items.slice(0, 80).forEach(item => {
    const card = document.createElement('div');
    card.className = 'asset-card';

    if (item.itemType === 'image') {
      card.innerHTML = `
        <img src="${item.src}" class="asset-thumb" alt="${item.alt || 'Asset'}" loading="lazy" />
        <div class="asset-meta">${item.width}×${item.height}</div>
      `;
      card.title = `Click to copy: ${item.src}`;
      card.addEventListener('click', () => {
        navigator.clipboard.writeText(item.src);
        showToast('Image URL copied');
      });
    } else if (item.itemType === 'svg') {
      card.innerHTML = `
        <div class="asset-thumb" style="display:flex;align-items:center;justify-content:center;padding:8px;background:#18181b;">
          ${item.code}
        </div>
        <div class="asset-meta">${item.title}</div>
      `;
      card.title = 'Click to copy SVG markup';
      card.addEventListener('click', () => {
        navigator.clipboard.writeText(item.code);
        showToast('SVG markup copied');
      });
    } else if (item.itemType === 'link') {
      card.innerHTML = `
        <div class="asset-thumb" style="display:flex;align-items:center;justify-content:center;background:#121214;color:#f4f3ee;font-size:10px;font-family:var(--font-mono);padding:4px;text-align:center;">
          LINK
        </div>
        <div class="asset-meta">${item.text}</div>
      `;
      card.title = `Click to copy: ${item.href}`;
      card.addEventListener('click', () => {
        navigator.clipboard.writeText(item.href);
        showToast('Link URL copied');
      });
    }

    elements.assetsGrid.appendChild(card);
  });
}

// 4. Render Reader Mode
function renderReader() {
  const { reader } = state.pageData;
  if (!reader) return;

  elements.readTime.textContent = `${reader.readingTime} min`;
  elements.readWords.textContent = reader.wordCount.toLocaleString();
  elements.readLevel.textContent = reader.readingLevel || 'Standard';

  // Keywords
  elements.readerKeywords.innerHTML = '';
  if (reader.topKeywords && reader.topKeywords.length > 0) {
    reader.topKeywords.forEach(k => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = `#${k.word} (${k.count})`;
      elements.readerKeywords.appendChild(chip);
    });
  }

  // Article paragraphs
  elements.readerArticleContent.innerHTML = '';
  if (reader.paragraphs && reader.paragraphs.length > 0) {
    reader.paragraphs.forEach(p => {
      const el = document.createElement(p.tag === 'h2' || p.tag === 'h3' ? p.tag : 'p');
      el.textContent = p.text;
      elements.readerArticleContent.appendChild(el);
    });
  } else {
    elements.readerArticleContent.innerHTML = '<p class="empty-state">No long-form article detected on this page.</p>';
  }
}

// 5. Scratchpad & Safe Sandbox Runner
function setupScratchpad() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get('snippets').then(({ snippets = [] }) => {
      elements.snippetSelect.innerHTML = '<option value="">Load Snippet...</option>';
      snippets.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.title;
        elements.snippetSelect.appendChild(opt);
      });

      elements.snippetSelect.addEventListener('change', () => {
        const found = snippets.find(s => s.id === elements.snippetSelect.value);
        if (found) elements.codeEditor.value = found.code;
      });
    });
  }

  // Save Snippet
  elements.btnSaveSnippet.addEventListener('click', async () => {
    const code = elements.codeEditor.value.trim();
    if (!code) return;
    const title = prompt('Snippet title:', `Snippet ${new Date().toLocaleTimeString()}`);
    if (!title) return;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const { snippets = [] } = await chrome.storage.local.get('snippets');
      const newSnip = { id: `snip-${Date.now()}`, title, code };
      await chrome.storage.local.set({ snippets: [newSnip, ...snippets] });

      const opt = document.createElement('option');
      opt.value = newSnip.id;
      opt.textContent = newSnip.title;
      elements.snippetSelect.appendChild(opt);
      elements.snippetSelect.value = newSnip.id;
      showToast('Snippet saved');
    }
  });

  // Run in Sandbox
  elements.btnRunSandbox.addEventListener('click', () => {
    const code = elements.codeEditor.value;
    if (!code.trim()) return;

    const execId = `exec-${Date.now()}`;
    elements.execTime.textContent = 'Running...';
    elements.consoleOutput.innerHTML = '<span class="term-dim">// Executing in sandbox...</span>';

    state.pendingSandboxExecutions.set(execId, performance.now());
    elements.sandboxFrame.contentWindow.postMessage({ id: execId, code }, '*');
  });

  // Query Active Tab Page DOM
  elements.btnQueryPage.addEventListener('click', async () => {
    const selector = prompt('Enter CSS Selector to query in active tab:', 'img, h1, a, button');
    if (!selector) return;

    if (!state.activeTab?.id) {
      // In standalone demo, query local document
      const elementsList = Array.from(document.querySelectorAll(selector));
      elements.consoleOutput.textContent = JSON.stringify({
        count: elementsList.length,
        sample: elementsList.slice(0, 5).map(e => ({ tag: e.tagName.toLowerCase(), id: e.id, class: e.className }))
      }, null, 2);
      return;
    }

    elements.execTime.textContent = 'Querying...';
    try {
      const res = await chrome.tabs.sendMessage(state.activeTab.id, {
        type: 'QUERY_DOM',
        selector
      });
      elements.execTime.textContent = 'Done';
      elements.consoleOutput.textContent = JSON.stringify(res.result, null, 2);
    } catch (err) {
      elements.consoleOutput.textContent = `Error querying page: ${err.message}`;
    }
  });

  // Clear Console
  elements.btnClearConsole.addEventListener('click', () => {
    elements.consoleOutput.innerHTML = '<span class="term-dim">// Console cleared</span>';
    elements.execTime.textContent = '';
  });
}

function setupSandboxMessaging() {
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || !data.id || !state.pendingSandboxExecutions.has(data.id)) return;

    state.pendingSandboxExecutions.delete(data.id);
    elements.execTime.textContent = `${data.durationMs}ms`;

    let output = '';
    if (data.logs && data.logs.length > 0) {
      output += data.logs.map(l => `[${l.type.toUpperCase()}] ${l.message}`).join('\n') + '\n';
    }

    if (data.error) {
      output += `Error: ${data.error.name}: ${data.error.message}\n${data.error.stack || ''}`;
      elements.consoleOutput.style.color = '#fb7185';
    } else {
      output += `➜ Result: ${data.result}`;
      elements.consoleOutput.style.color = '#f4f3ee';
    }

    elements.consoleOutput.textContent = output;
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 2000);
}
