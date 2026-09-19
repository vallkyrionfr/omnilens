/**
 * OmniLens Content Script
 * Executes in the page context to inspect DOM, extract assets & colors, and render visual overlays.
 */

(() => {
  if (window.__omnilens_injected) return;
  window.__omnilens_injected = true;

  let activeOverlay = null;
  let activeTargetElement = null;
  let isPickerActive = false;
  let pickerBanner = null;
  let trackingRaf = null;

  // Direct reference cache of audited elements by issue ID
  const auditedElementsMap = new Map();

  // Listen for extension messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        switch (message.type) {
          case 'PING':
            sendResponse({ status: 'ok', url: window.location.href });
            break;

          case 'INSPECT_PAGE': {
            const data = await fullPageInspection();
            // Notify background service worker to update badge
            chrome.runtime.sendMessage({
              type: 'UPDATE_BADGE',
              text: data.a11y.issues.length > 0 ? String(data.a11y.issues.length) : '✓',
              color: data.a11y.issues.length > 0 ? '#f43f5e' : '#22c55e'
            }).catch(() => {});
            sendResponse({ success: true, data });
            break;
          }

          case 'HIGHLIGHT_ELEMENT': {
            let target = null;
            if (message.issueId && auditedElementsMap.has(message.issueId)) {
              target = auditedElementsMap.get(message.issueId);
            }
            if (!target && message.uniqueSelector) {
              try { target = document.querySelector(message.uniqueSelector); } catch {}
            }
            if (!target && message.selector) {
              try { target = document.querySelector(message.selector); } catch {}
            }

            if (target) {
              highlightElement(target, message.label);
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: 'Target element not found' });
            }
            break;
          }

          case 'CLEAR_HIGHLIGHT': {
            removeHighlight();
            sendResponse({ success: true });
            break;
          }

          case 'START_ELEMENT_PICKER': {
            startElementPicker();
            sendResponse({ success: true });
            break;
          }

          case 'STOP_ELEMENT_PICKER': {
            stopElementPicker();
            sendResponse({ success: true });
            break;
          }

          case 'QUERY_DOM': {
            const result = queryDom(message.selector);
            sendResponse({ success: true, result });
            break;
          }

          default:
            sendResponse({ error: 'Unknown content script action' });
            break;
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  });

  // --- Fixed Overlay & Continuous Frame Tracking ---

  function removeHighlight() {
    stopContinuousTracking();
    if (activeOverlay && activeOverlay.parentNode) {
      activeOverlay.parentNode.removeChild(activeOverlay);
      activeOverlay = null;
    }
    activeTargetElement = null;
    window.removeEventListener('scroll', updateOverlayPosition, { capture: true });
    window.removeEventListener('resize', updateOverlayPosition);
  }

  function updateOverlayPosition() {
    if (!activeOverlay || !activeTargetElement) return;

    if (!activeTargetElement.isConnected) {
      removeHighlight();
      return;
    }

    const rect = activeTargetElement.getBoundingClientRect();

    // Check if element is completely scrolled out of view or collapsed
    if (rect.width === 0 || rect.height === 0 || rect.bottom < -80 || rect.top > window.innerHeight + 80) {
      activeOverlay.style.display = 'none';
      return;
    } else {
      activeOverlay.style.display = 'block';
    }

    activeOverlay.style.top = `${rect.top}px`;
    activeOverlay.style.left = `${rect.left}px`;
    activeOverlay.style.width = `${rect.width}px`;
    activeOverlay.style.height = `${rect.height}px`;

    // Dynamic badge flip if near viewport ceiling
    const badge = activeOverlay.querySelector('#omnilens-highlight-badge');
    if (badge) {
      if (rect.top < 34) {
        badge.style.bottom = 'auto';
        badge.style.top = 'calc(100% + 4px)';
      } else {
        badge.style.bottom = 'calc(100% + 6px)';
        badge.style.top = 'auto';
      }
    }
  }

  function startContinuousTracking() {
    if (trackingRaf) cancelAnimationFrame(trackingRaf);
    function loop() {
      if (activeOverlay && activeTargetElement) {
        updateOverlayPosition();
        trackingRaf = requestAnimationFrame(loop);
      }
    }
    trackingRaf = requestAnimationFrame(loop);
  }

  function stopContinuousTracking() {
    if (trackingRaf) {
      cancelAnimationFrame(trackingRaf);
      trackingRaf = null;
    }
  }

  function highlightElement(target, label = '') {
    removeHighlight();
    if (!target || !target.getBoundingClientRect) return;

    activeTargetElement = target;
    const rect = target.getBoundingClientRect();

    const overlay = document.createElement('div');
    overlay.id = 'omnilens-highlight-overlay';
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    const badge = document.createElement('div');
    badge.id = 'omnilens-highlight-badge';

    const tagStr = target.tagName.toLowerCase();
    const idStr = target.id ? `#${target.id}` : '';
    const classStr = target.className && typeof target.className === 'string'
      ? `.${target.className.trim().split(/\s+/)[0]}`
      : '';

    badge.innerHTML = `
      <span class="badge-tag">&lt;${tagStr}${idStr}${classStr}&gt;</span>
      <span class="badge-dim">${Math.round(rect.width)}×${Math.round(rect.height)}</span>
    `;

    if (label) {
      const labelSpan = document.createElement('span');
      labelSpan.style.color = '#fb7185';
      labelSpan.textContent = ` • ${label}`;
      badge.appendChild(labelSpan);
    }

    overlay.appendChild(badge);
    document.documentElement.appendChild(overlay);
    activeOverlay = overlay;

    // Listen to scroll with capture: true on window & document to catch nested scroll containers
    window.addEventListener('scroll', updateOverlayPosition, { passive: true, capture: true });
    window.addEventListener('resize', updateOverlayPosition, { passive: true });

    // Start continuous tracking loop so smooth-scrolling and transitions stay glued
    updateOverlayPosition();
    startContinuousTracking();

    // Smooth scroll if element is outside current viewport
    if (rect.top < 60 || rect.bottom > window.innerHeight - 60) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // --- Interactive In-Page Element Picker ---

  function startElementPicker() {
    if (isPickerActive) return;
    isPickerActive = true;

    if (!pickerBanner) {
      pickerBanner = document.createElement('div');
      pickerBanner.id = 'omnilens-picker-banner';
      pickerBanner.innerHTML = `
        <span>🔍 <strong>OmniLens Inspector</strong>: Hover over element and click to inspect. Press <kbd>Esc</kbd> to exit.</span>
        <button id="omnilens-picker-close">Exit</button>
      `;
      document.documentElement.appendChild(pickerBanner);

      document.getElementById('omnilens-picker-close')?.addEventListener('click', () => {
        stopElementPicker();
      });
    }

    document.addEventListener('mousemove', onPickerMouseMove, true);
    document.addEventListener('click', onPickerClick, true);
    document.addEventListener('keydown', onPickerKeyDown, true);
  }

  function stopElementPicker() {
    if (!isPickerActive) return;
    isPickerActive = false;

    if (pickerBanner && pickerBanner.parentNode) {
      pickerBanner.parentNode.removeChild(pickerBanner);
      pickerBanner = null;
    }

    document.removeEventListener('mousemove', onPickerMouseMove, true);
    document.removeEventListener('click', onPickerClick, true);
    document.removeEventListener('keydown', onPickerKeyDown, true);

    chrome.runtime.sendMessage({ type: 'PICKER_STATUS_CHANGED', active: false }).catch(() => {});
  }

  function onPickerMouseMove(e) {
    if (!isPickerActive) return;
    const target = e.target;
    if (!target || target === pickerBanner || pickerBanner?.contains(target) || target.id === 'omnilens-highlight-overlay') {
      return;
    }
    highlightElement(target);
  }

  function onPickerClick(e) {
    if (!isPickerActive) return;
    const target = e.target;
    if (target === pickerBanner || pickerBanner?.contains(target)) return;

    e.preventDefault();
    e.stopPropagation();

    const style = window.getComputedStyle(target);
    const rect = target.getBoundingClientRect();

    const elementData = {
      tag: target.tagName.toLowerCase(),
      id: target.id || null,
      className: typeof target.className === 'string' ? target.className : null,
      selector: getDisplaySelector(target),
      uniqueSelector: getUniqueSelector(target),
      text: target.textContent.trim().slice(0, 100),
      rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
      style: {
        color: style.color,
        backgroundColor: style.backgroundColor,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight
      }
    };

    chrome.runtime.sendMessage({
      type: 'ELEMENT_PICKED',
      data: elementData
    }).catch(() => {});

    stopElementPicker();
  }

  function onPickerKeyDown(e) {
    if (e.key === 'Escape') {
      stopElementPicker();
      removeHighlight();
    }
  }

  // Generate robust, unique CSS selector
  function getUniqueSelector(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;

    const path = [];
    let current = el;

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
      if (current.id) {
        path.unshift(`#${CSS.escape(current.id)}`);
        break;
      }

      const tag = current.tagName.toLowerCase();
      let sibling = current;
      let nth = 1;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.tagName.toLowerCase() === tag) {
          nth++;
        }
      }
      path.unshift(`${tag}:nth-of-type(${nth})`);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  function getDisplaySelector(el) {
    if (!el || !el.tagName) return '';
    const tag = el.tagName.toLowerCase();
    if (el.id) return `${tag}#${el.id}`;
    if (el.className && typeof el.className === 'string') {
      const firstClass = el.className.trim().split(/\s+/)[0];
      if (firstClass) return `${tag}.${firstClass}`;
    }
    return tag;
  }

  // --- Safe DOM Query ---

  function queryDom(selector) {
    if (!selector) return { count: 0, sample: [] };
    const elements = Array.from(document.querySelectorAll(selector));
    return {
      count: elements.length,
      sample: elements.slice(0, 8).map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent.trim().slice(0, 80),
        id: el.id || null,
        className: typeof el.className === 'string' ? el.className : null
      }))
    };
  }

  // --- Full Page Inspection Engine ---

  async function fullPageInspection() {
    // Clear previously audited element map
    auditedElementsMap.clear();

    // 1. Metadata
    const metadata = {
      title: document.title || 'Untitled Document',
      url: window.location.href,
      origin: window.location.origin,
      description: getMetaContent('meta[name="description"]') || getMetaContent('meta[property="og:description"]'),
      canonical: getMetaContent('link[rel="canonical"]', 'href'),
      viewport: getMetaContent('meta[name="viewport"]'),
      charset: document.characterSet || 'UTF-8',
      lang: document.documentElement.lang || '',
      openGraph: {
        title: getMetaContent('meta[property="og:title"]'),
        image: getMetaContent('meta[property="og:image"]'),
        type: getMetaContent('meta[property="og:type"]')
      },
      twitter: {
        card: getMetaContent('meta[name="twitter:card"]'),
        title: getMetaContent('meta[name="twitter:title"]')
      }
    };

    // 2. DOM & Headings
    const domMetrics = measureDom();
    const headings = extractHeadings();
    const techStack = detectTech();

    // 3. Accessibility & Contrast Audit
    const a11y = auditAccessibility();

    // 4. Color & Typography Palette
    const palette = await extractColorsAndFonts();

    // 5. Assets & Links
    const assets = harvestPageAssets();

    // 6. Reader Content
    const reader = extractArticle();

    return {
      metadata,
      domMetrics,
      headings,
      techStack,
      a11y,
      palette,
      assets,
      reader,
      timestamp: Date.now()
    };
  }

  function getMetaContent(selector, attr = 'content') {
    const el = document.querySelector(selector);
    return el ? el.getAttribute(attr) || '' : '';
  }

  function measureDom() {
    let totalNodes = 0;
    let maxDepth = 0;
    const tagDist = {};

    function walk(node, depth) {
      totalNodes++;
      if (depth > maxDepth) maxDepth = depth;
      const tag = node.tagName.toLowerCase();
      tagDist[tag] = (tagDist[tag] || 0) + 1;
      for (const child of node.children) {
        walk(child, depth + 1);
      }
    }

    if (document.body) walk(document.body, 1);
    return { totalNodes, maxDepth, tagDistribution: tagDist };
  }

  function extractHeadings() {
    const list = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const warnings = [];
    let prev = 0;

    const items = list.map((el, i) => {
      const level = parseInt(el.tagName[1], 10);
      if (prev > 0 && level > prev + 1) {
        warnings.push(`Skipped heading: <${list[i - 1].tagName.toLowerCase()}> jumped to <${el.tagName.toLowerCase()}>`);
      }
      prev = level;
      return {
        level,
        tag: el.tagName.toLowerCase(),
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 100),
        id: el.id || null
      };
    });

    return { items, warnings, h1Count: items.filter(h => h.level === 1).length };
  }

  function detectTech() {
    const tech = [];
    const add = (name, category) => {
      if (!tech.some(t => t.name === name)) tech.push({ name, category });
    };

    if (document.querySelector('[data-reactroot], [data-reactid]') || window._reactListening) add('React', 'UI Framework');
    if (document.getElementById('__next') || window.__NEXT_DATA__) add('Next.js', 'Full-stack Framework');
    if (document.querySelector('[data-v-]') || window.__VUE__) add('Vue.js', 'UI Framework');
    if (document.getElementById('__nuxt') || window.__NUXT__) add('Nuxt', 'Full-stack Framework');
    if (document.querySelector('[ng-version]')) add('Angular', 'UI Framework');
    if (document.querySelector('[class*="svelte-"]')) add('Svelte', 'UI Framework');
    if (window.bootstrap || document.querySelector('link[href*="bootstrap"]')) add('Bootstrap', 'CSS Framework');
    if (window.jQuery || window.$?.fn?.jquery) add('jQuery', 'DOM Utility');
    if (window.dataLayer || window.google_tag_manager) add('Google Tag Manager', 'Analytics');

    return tech;
  }

  // --- Accessibility with Real WCAG Contrast Checks ---

  function parseRgb(colorStr) {
    if (!colorStr) return null;
    const match = colorStr.match(/\d+/g);
    if (!match || match.length < 3) return null;
    return {
      r: parseInt(match[0], 10),
      g: parseInt(match[1], 10),
      b: parseInt(match[2], 10),
      a: match[3] !== undefined ? parseFloat(match[3]) : 1
    };
  }

  function getLuminance({ r, g, b }) {
    const [rs, gs, bs] = [r, g, b].map(c => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  function computeContrast(c1, c2) {
    const l1 = getLuminance(c1);
    const l2 = getLuminance(c2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
  }

  function auditAccessibility() {
    const issues = [];
    const add = (type, severity, message, el) => {
      const issueId = `a11y-${issues.length}`;
      if (el) {
        auditedElementsMap.set(issueId, el);
      }

      issues.push({
        id: issueId,
        type,
        severity,
        message,
        selector: getDisplaySelector(el),
        uniqueSelector: getUniqueSelector(el),
        snippet: el ? el.outerHTML.slice(0, 120) : null
      });
    };

    if (!document.documentElement.lang) {
      add('doc-lang', 'serious', 'Missing "lang" attribute on <html> element.', document.documentElement);
    }
    if (!document.title || !document.title.trim()) {
      add('doc-title', 'critical', 'Document <title> is missing or empty.', document.head);
    }
    if (!document.querySelector('main, [role="main"]')) {
      add('landmark-main', 'moderate', 'Missing main landmark (<main> or role="main").', document.body);
    }

    // Images
    document.querySelectorAll('img').forEach(img => {
      if (!img.hasAttribute('alt')) {
        add('image-alt', 'critical', 'Image missing "alt" attribute.', img);
      }
    });

    // Form inputs
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(control => {
      const hasId = control.id && document.querySelector(`label[for="${control.id}"]`);
      const hasWrap = control.closest('label');
      const hasAria = control.getAttribute('aria-label') || control.getAttribute('aria-labelledby');
      if (!hasId && !hasWrap && !hasAria) {
        add('form-label', 'critical', `Form control <${control.tagName.toLowerCase()}> is missing an accessible label.`, control);
      }
    });

    // Buttons and links
    document.querySelectorAll('button, a[href]').forEach(el => {
      const text = el.textContent.trim();
      const hasAria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
      const hasImg = el.querySelector('img[alt]:not([alt=""])');
      if (!text && !hasAria && !hasImg) {
        add('empty-interactive', 'critical', `<${el.tagName.toLowerCase()}> is empty without an accessible name.`, el);
      }
    });

    // Duplicate IDs
    const seenIds = new Set();
    document.querySelectorAll('[id]').forEach(el => {
      const id = el.id.trim();
      if (id) {
        if (seenIds.has(id)) {
          add('duplicate-id', 'serious', `Duplicate ID found: "#${id}"`, el);
        } else {
          seenIds.add(id);
        }
      }
    });

    // Contrast Check on sampled text elements
    const sampleTextEls = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, span, a, button')).slice(0, 40);
    sampleTextEls.forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

      const fg = parseRgb(style.color);
      if (!fg) return;

      // Find background
      let cur = el;
      let bg = null;
      while (cur && cur !== document.documentElement) {
        const bgStyle = window.getComputedStyle(cur);
        const parsed = parseRgb(bgStyle.backgroundColor);
        if (parsed && parsed.a > 0.3) {
          bg = parsed;
          break;
        }
        cur = cur.parentElement;
      }
      if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };

      const ratio = computeContrast(fg, bg);
      const fontSize = parseFloat(style.fontSize) || 16;
      const isBold = parseInt(style.fontWeight, 10) >= 700;
      const isLarge = fontSize >= 24 || (fontSize >= 18.66 && isBold);
      const minRatio = isLarge ? 3.0 : 4.5;

      if (ratio < minRatio) {
        add('low-contrast', 'serious', `Low text contrast ${ratio}:1 (expected >= ${minRatio}:1) on "${el.textContent.trim().slice(0, 30)}..."`, el);
      }
    });

    // Deduct score
    const penalties = { critical: 15, serious: 8, moderate: 4, minor: 1 };
    let totalDeduction = 0;
    issues.forEach(i => { totalDeduction += penalties[i.severity] || 2; });
    const score = Math.max(0, 100 - totalDeduction);

    return {
      score,
      issues,
      summary: {
        critical: issues.filter(i => i.severity === 'critical').length,
        serious: issues.filter(i => i.severity === 'serious').length,
        moderate: issues.filter(i => i.severity === 'moderate').length,
        total: issues.length
      }
    };
  }

  // --- Batched Color & Font Extraction ---

  async function extractColorsAndFonts() {
    const colorMap = new Map();
    const fontMap = new Map();

    const elements = Array.from(document.querySelectorAll('*')).slice(0, 250);
    const BATCH_SIZE = 50;

    for (let i = 0; i < elements.length; i += BATCH_SIZE) {
      const batch = elements.slice(i, i + BATCH_SIZE);

      await new Promise(resolve => requestAnimationFrame(() => {
        batch.forEach(el => {
          const style = window.getComputedStyle(el);
          const fg = style.color;
          const bg = style.backgroundColor;
          const font = style.fontFamily ? style.fontFamily.split(',')[0].replace(/['"]/g, '').trim() : null;

          if (fg && fg !== 'rgba(0, 0, 0, 0)') colorMap.set(fg, (colorMap.get(fg) || 0) + 1);
          if (bg && bg !== 'rgba(0, 0, 0, 0)') colorMap.set(bg, (colorMap.get(bg) || 0) + 1);
          if (font) fontMap.set(font, (fontMap.get(font) || 0) + 1);
        });
        resolve();
      }));
    }

    const sortedColors = Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([rgbStr, count]) => ({
        raw: rgbStr,
        hex: rgbToHex(rgbStr),
        count
      }));

    const sortedFonts = Array.from(fontMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));

    return { colors: sortedColors, fonts: sortedFonts };
  }

  function rgbToHex(rgbStr) {
    const match = rgbStr.match(/\d+/g);
    if (!match || match.length < 3) return rgbStr;
    const r = parseInt(match[0], 10).toString(16).padStart(2, '0');
    const g = parseInt(match[1], 10).toString(16).padStart(2, '0');
    const b = parseInt(match[2], 10).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  // --- Asset Harvester ---

  function harvestPageAssets() {
    const images = [];
    const svgs = [];
    const links = [];
    const currentOrigin = window.location.origin;

    // Images
    const imgEls = Array.from(document.querySelectorAll('img')).slice(0, 50);
    imgEls.forEach((img, i) => {
      const src = img.currentSrc || img.src;
      if (src && !images.some(im => im.src === src)) {
        images.push({
          id: `img-${i}`,
          src,
          alt: img.alt || '',
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0
        });
      }
    });

    // SVGs
    const svgEls = Array.from(document.querySelectorAll('svg')).slice(0, 30);
    svgEls.forEach((svg, i) => {
      svgs.push({
        id: `svg-${i}`,
        title: svg.querySelector('title')?.textContent || `SVG Icon ${i + 1}`,
        code: svg.outerHTML.slice(0, 1500)
      });
    });

    // Links
    const linkEls = Array.from(document.querySelectorAll('a[href]')).slice(0, 50);
    linkEls.forEach((a, i) => {
      const href = a.href;
      if (href && !links.some(l => l.href === href)) {
        links.push({
          id: `link-${i}`,
          href,
          text: a.textContent.trim().slice(0, 60) || '[No Text]',
          isExternal: !href.startsWith(currentOrigin)
        });
      }
    });

    return {
      images,
      svgs,
      links,
      stats: {
        totalImages: images.length,
        totalSvgs: svgs.length,
        totalLinks: links.length
      }
    };
  }

  // --- Reader Mode ---

  function extractArticle() {
    const candidate = document.querySelector('article, [role="article"], main, .article, #content') || document.body;
    const rawText = candidate ? candidate.textContent : '';
    const cleanText = rawText.replace(/\s+/g, ' ').trim();

    const words = cleanText.match(/\b[A-Za-z0-9'-]+\b/g) || [];
    const wordCount = words.length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    const paragraphs = Array.from(candidate.querySelectorAll('p, h2, h3'))
      .map(p => ({ tag: p.tagName.toLowerCase(), text: p.textContent.trim() }))
      .filter(p => p.text.length > 25)
      .slice(0, 20);

    return {
      wordCount,
      readingTime,
      paragraphs,
      preview: cleanText.slice(0, 300)
    };
  }

})();
