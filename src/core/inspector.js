/**
 * OmniLens Core - DOM Inspector & Tech Stack Detector
 * Analyzes document structure, metadata, heading trees, and identifies frontend libraries/frameworks.
 */

/**
 * Extract comprehensive document metadata
 */
export function extractMetadata(doc = document) {
  const getMeta = (query, attr = 'content') => {
    const el = doc.querySelector(query);
    return el ? el.getAttribute(attr) || el.textContent || '' : null;
  };

  return {
    title: doc.title || '',
    description: getMeta('meta[name="description"]') || getMeta('meta[property="og:description"]') || '',
    canonical: getMeta('link[rel="canonical"]', 'href') || '',
    charset: doc.characterSet || '',
    language: doc.documentElement.lang || '',
    viewport: getMeta('meta[name="viewport"]') || '',
    robots: getMeta('meta[name="robots"]') || '',
    openGraph: {
      title: getMeta('meta[property="og:title"]'),
      description: getMeta('meta[property="og:description"]'),
      image: getMeta('meta[property="og:image"]'),
      type: getMeta('meta[property="og:type"]'),
      url: getMeta('meta[property="og:url"]')
    },
    twitter: {
      card: getMeta('meta[name="twitter:card"]'),
      title: getMeta('meta[name="twitter:title"]'),
      description: getMeta('meta[name="twitter:description"]'),
      image: getMeta('meta[name="twitter:image"]')
    }
  };
}

/**
 * Measure DOM structure metrics (total nodes, max depth, tag frequency)
 */
export function measureDomStructure(root = document.body) {
  if (!root) {
    return { totalNodes: 0, maxDepth: 0, tagDistribution: {} };
  }

  let totalNodes = 0;
  let maxDepth = 0;
  const tagDistribution = {};

  function traverse(node, currentDepth) {
    totalNodes++;
    if (currentDepth > maxDepth) {
      maxDepth = currentDepth;
    }

    const tag = node.tagName.toLowerCase();
    tagDistribution[tag] = (tagDistribution[tag] || 0) + 1;

    for (const child of node.children) {
      traverse(child, currentDepth + 1);
    }
  }

  traverse(root, 1);

  return {
    totalNodes,
    maxDepth,
    tagDistribution
  };
}

/**
 * Extract and validate heading hierarchy (h1 through h6)
 * Detects skipped levels (e.g. h1 -> h3 without h2)
 */
export function extractHeadingOutline(doc = document) {
  const headingElements = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const outline = [];
  const warnings = [];

  let prevLevel = 0;

  headingElements.forEach((el, index) => {
    const level = parseInt(el.tagName.substring(1), 10);
    const text = el.textContent.trim().replace(/\s+/g, ' ');

    // Check for skipped heading level
    if (prevLevel > 0 && level > prevLevel + 1) {
      warnings.push({
        index,
        message: `Skipped heading level: <${headingElements[index - 1].tagName.toLowerCase()}> jumped to <${el.tagName.toLowerCase()}>`,
        text
      });
    }

    outline.push({
      level,
      tag: el.tagName.toLowerCase(),
      text: text.slice(0, 100),
      id: el.id || null
    });

    prevLevel = level;
  });

  return {
    headings: outline,
    warnings,
    h1Count: outline.filter(h => h.level === 1).length
  };
}

/**
 * Detect frontend frameworks, libraries, and tools via DOM signatures and globals
 */
export function detectTechStack(doc = document, win = window) {
  const technologies = [];

  const addTech = (name, category, confidence = 'high') => {
    if (!technologies.some(t => t.name === name)) {
      technologies.push({ name, category, confidence });
    }
  };

  // React
  if (doc.querySelector('[data-reactroot], [data-reactid]') || win._reactListening || win.React) {
    addTech('React', 'Frontend Framework');
  }

  // Next.js
  if (doc.getElementById('__next') || win.__NEXT_DATA__) {
    addTech('Next.js', 'Meta-Framework');
  }

  // Vue.js
  if (doc.querySelector('[data-v-]') || win.__VUE__ || win.Vue) {
    addTech('Vue.js', 'Frontend Framework');
  }

  // Nuxt.js
  if (doc.getElementById('__nuxt') || win.__NUXT__) {
    addTech('Nuxt.js', 'Meta-Framework');
  }

  // Angular
  if (doc.querySelector('[ng-version], [_nghost], [_ngcontent]') || win.ng) {
    addTech('Angular', 'Frontend Framework');
  }

  // Svelte
  if (doc.querySelector('[class*="svelte-"]') || win.__svelte) {
    addTech('Svelte', 'Frontend Framework');
  }

  // Tailwind CSS
  if (doc.querySelector('[class*="flex"], [class*="grid"], [class*="bg-"], [class*="text-"]') &&
      Array.from(doc.styleSheets).some(s => {
        try {
          return Array.from(s.cssRules || []).some(r => r.selectorText?.includes('hover\\:'));
        } catch {
          return false;
        }
      })) {
    addTech('Tailwind CSS', 'CSS Framework');
  }

  // Bootstrap
  if (doc.querySelector('.container, .row, .col, .btn-primary') && (win.bootstrap || doc.querySelector('link[href*="bootstrap"]'))) {
    addTech('Bootstrap', 'CSS Framework');
  }

  // jQuery
  if (win.jQuery || win.$?.fn?.jquery) {
    addTech(`jQuery ${win.jQuery?.fn?.jquery || ''}`.trim(), 'JavaScript Utility');
  }

  // Analytics & Tag Managers
  if (win.dataLayer || win.google_tag_manager) {
    addTech('Google Tag Manager', 'Analytics');
  }
  if (win.ga || win.gtag) {
    addTech('Google Analytics', 'Analytics');
  }

  return technologies;
}
