/**
 * OmniLens Core - Asset & Media Harvester
 * Extracts, classifies, and previews images, SVGs, media, links, and code assets.
 */

export function harvestAssets(doc = document, baseUrl = window.location.href) {
  const currentOrigin = new URL(baseUrl).origin;

  // 1. Harvest Images
  const rawImages = Array.from(doc.querySelectorAll('img, picture source, [style*="background-image"]'));
  const imageMap = new Map();

  rawImages.forEach((el, index) => {
    let src = '';
    let alt = '';
    let width = el.naturalWidth || el.width || 0;
    let height = el.naturalHeight || el.height || 0;

    if (el.tagName === 'IMG') {
      src = el.currentSrc || el.src;
      alt = el.alt || '';
    } else if (el.tagName === 'SOURCE') {
      src = el.srcset ? el.srcset.split(',')[0].trim().split(' ')[0] : '';
    } else if (el.style?.backgroundImage) {
      const match = el.style.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/);
      if (match) src = match[1];
    }

    if (src && !src.startsWith('javascript:')) {
      try {
        const absUrl = new URL(src, baseUrl).href;
        if (!imageMap.has(absUrl)) {
          const extension = absUrl.split(/[#?]/)[0].split('.').pop().toLowerCase() || 'unknown';
          imageMap.set(absUrl, {
            id: `img-${index}`,
            type: 'image',
            url: absUrl,
            alt,
            width,
            height,
            format: extension.length <= 5 ? extension : 'image',
            isDataUrl: absUrl.startsWith('data:'),
            isExternal: !absUrl.startsWith(currentOrigin)
          });
        }
      } catch {
        // Ignore invalid URLs
      }
    }
  });

  // 2. Harvest Inline & External SVGs
  const rawSvgs = Array.from(doc.querySelectorAll('svg'));
  const svgs = rawSvgs.map((svg, index) => {
    const titleEl = svg.querySelector('title');
    const width = svg.clientWidth || svg.getAttribute('width') || 24;
    const height = svg.clientHeight || svg.getAttribute('height') || 24;
    const code = svg.outerHTML;

    return {
      id: `svg-${index}`,
      type: 'svg',
      title: titleEl ? titleEl.textContent.trim() : `SVG Element ${index + 1}`,
      width: parseInt(width, 10) || 24,
      height: parseInt(height, 10) || 24,
      code,
      viewBox: svg.getAttribute('viewBox') || ''
    };
  });

  // 3. Harvest Links
  const rawLinks = Array.from(doc.querySelectorAll('a[href]'));
  const linkMap = new Map();

  rawLinks.forEach((a, index) => {
    const rawHref = a.getAttribute('href');
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;

    try {
      const absUrl = new URL(rawHref, baseUrl).href;
      if (!linkMap.has(absUrl)) {
        const isExternal = !absUrl.startsWith(currentOrigin);
        linkMap.set(absUrl, {
          id: `link-${index}`,
          href: absUrl,
          text: a.textContent.trim().slice(0, 80) || '[No Text]',
          target: a.target || '_self',
          rel: a.rel || '',
          isExternal
        });
      }
    } catch {
      // Ignore invalid URLs
    }
  });

  // 4. Harvest Stylesheets and Scripts
  const stylesheets = Array.from(doc.querySelectorAll('link[rel="stylesheet"], style')).map((el, i) => {
    if (el.tagName === 'LINK') {
      return { id: `css-${i}`, type: 'external', href: el.href };
    }
    return { id: `css-${i}`, type: 'inline', length: el.textContent.length };
  });

  const scripts = Array.from(doc.querySelectorAll('script')).map((s, i) => {
    return {
      id: `js-${i}`,
      type: s.src ? 'external' : 'inline',
      src: s.src || null,
      async: s.async,
      defer: s.defer,
      module: s.type === 'module'
    };
  });

  return {
    images: Array.from(imageMap.values()),
    svgs,
    links: Array.from(linkMap.values()),
    stylesheets,
    scripts,
    stats: {
      totalImages: imageMap.size,
      totalSvgs: svgs.length,
      totalLinks: linkMap.size,
      externalLinks: Array.from(linkMap.values()).filter(l => l.isExternal).length,
      totalScripts: scripts.length
    }
  };
}
