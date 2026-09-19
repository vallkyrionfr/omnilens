/**
 * OmniLens Core - Accessibility (A11y) Engine
 * Audits pages for WCAG 2.1 Level AA conformance: images, forms, landmarks, headings, ARIA, and contrast.
 */

import { parseColor, getContrastRatio, evaluateWcag } from './colors.js';

export function runAccessibilityAudit(doc = document) {
  const issues = [];

  // Helper to add issue
  const addIssue = (type, severity, message, element, selector = '') => {
    issues.push({
      type,
      severity, // 'critical', 'serious', 'moderate', 'minor'
      message,
      selector: selector || getSimpleSelector(element),
      snippet: element ? element.outerHTML.slice(0, 150) : null
    });
  };

  // 1. Document Level Checks
  if (!doc.documentElement.lang) {
    addIssue('doc-lang', 'serious', 'Document <html> element is missing a "lang" attribute.', doc.documentElement, 'html');
  }

  if (!doc.title || doc.title.trim().length === 0) {
    addIssue('doc-title', 'critical', 'Document is missing a <title> element or title is empty.', doc.head, 'title');
  }

  // Landmark Check
  const hasMain = doc.querySelector('main, [role="main"]');
  if (!hasMain) {
    addIssue('landmark-main', 'moderate', 'Document lacks a main landmark (<main> or role="main").', doc.body, 'body');
  }

  // 2. Images & Media
  const images = doc.querySelectorAll('img');
  images.forEach(img => {
    if (!img.hasAttribute('alt')) {
      addIssue('image-alt', 'critical', 'Image missing "alt" attribute entirely.', img);
    } else if (img.getAttribute('alt').trim() === '' && img.getAttribute('role') !== 'presentation') {
      // Empty alt is acceptable if purely decorative, but flagged if inside a link
      if (img.closest('a')) {
        addIssue('linked-image-alt', 'serious', 'Linked image has empty alt text without link label.', img);
      }
    }
  });

  // 3. Form Controls & Inputs
  const formControls = doc.querySelectorAll('input:not([type="hidden"]), select, textarea');
  formControls.forEach(control => {
    const id = control.id;
    const hasLabel = id && doc.querySelector(`label[for="${id}"]`);
    const isWrappedInLabel = control.closest('label');
    const hasAriaLabel = control.getAttribute('aria-label') || control.getAttribute('aria-labelledby');

    if (!hasLabel && !isWrappedInLabel && !hasAriaLabel) {
      addIssue('form-label', 'critical', `Form control <${control.tagName.toLowerCase()}> is missing an accessible label.`, control);
    }
  });

  // 4. Buttons and Links
  const actionables = doc.querySelectorAll('button, a[href]');
  actionables.forEach(el => {
    const text = el.textContent.trim();
    const hasAria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    const hasImgWithAlt = el.querySelector('img[alt]:not([alt=""])');
    const hasSvgTitle = el.querySelector('svg title');

    if (!text && !hasAria && !hasImgWithAlt && !hasSvgTitle) {
      const tag = el.tagName.toLowerCase();
      addIssue('empty-interactive', 'critical', `<${tag}> element has no accessible name or visible text.`, el);
    }
  });

  // 5. Duplicate ID Checks
  const idMap = new Map();
  const allElementsWithId = doc.querySelectorAll('[id]');
  allElementsWithId.forEach(el => {
    const id = el.id.trim();
    if (id) {
      if (idMap.has(id)) {
        addIssue('duplicate-id', 'serious', `Duplicate element ID found: "#${id}"`, el);
      } else {
        idMap.set(id, true);
      }
    }
  });

  // 6. Text Contrast Spot Check (Sample prominent text elements)
  const textElements = Array.from(doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, button')).slice(0, 50);
  textElements.forEach(el => {
    if (typeof window === 'undefined' || !window.getComputedStyle) return;
    
    // Check if visible
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

    const textColor = parseColor(style.color);
    if (!textColor) return;

    // Resolve effective background
    let bgEl = el;
    let bgColor = null;
    while (bgEl && bgEl !== doc.documentElement) {
      const curStyle = window.getComputedStyle(bgEl);
      const parsedBg = parseColor(curStyle.backgroundColor);
      if (parsedBg && parsedBg.a > 0.1) {
        bgColor = parsedBg;
        break;
      }
      bgEl = bgEl.parentElement;
    }

    if (!bgColor) {
      bgColor = { r: 255, g: 255, b: 255, a: 1 }; // Default to white
    }

    const ratio = getContrastRatio(textColor, bgColor);
    if (ratio !== null) {
      const fontSize = parseFloat(style.fontSize) || 16;
      const isBold = parseInt(style.fontWeight, 10) >= 700 || style.fontWeight === 'bold';
      const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && isBold);

      const requiredRatio = isLargeText ? 3.0 : 4.5;
      if (ratio < requiredRatio) {
        addIssue(
          'color-contrast',
          'serious',
          `Low text contrast: ${ratio}:1 (expected minimum ${requiredRatio}:1). Text: "${el.textContent.trim().slice(0, 30)}..."`,
          el
        );
      }
    }
  });

  // Compute A11y Health Score (0 - 100)
  const deductions = {
    critical: 15,
    serious: 8,
    moderate: 4,
    minor: 1
  };

  let totalDeduction = 0;
  issues.forEach(issue => {
    totalDeduction += deductions[issue.severity] || 2;
  });

  const score = Math.max(0, 100 - totalDeduction);

  return {
    score,
    issues,
    summary: {
      critical: issues.filter(i => i.severity === 'critical').length,
      serious: issues.filter(i => i.severity === 'serious').length,
      moderate: issues.filter(i => i.severity === 'moderate').length,
      minor: issues.filter(i => i.severity === 'minor').length,
      total: issues.length
    }
  };
}

function getSimpleSelector(el) {
  if (!el || !el.tagName) return '';
  let selector = el.tagName.toLowerCase();
  if (el.id) {
    selector += `#${el.id}`;
    return selector;
  }
  if (el.className && typeof el.className === 'string') {
    const firstClass = el.className.trim().split(/\s+/)[0];
    if (firstClass) selector += `.${firstClass}`;
  }
  return selector;
}
