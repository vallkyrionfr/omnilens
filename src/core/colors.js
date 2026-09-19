/**
 * OmniLens Core - Color & Typography Utilities
 * Handles color parsing, conversions, relative luminance, and WCAG 2.1 contrast calculations.
 */

// Common CSS named colors mapping
const NAMED_COLORS = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  purple: '#800080',
  navy: '#000080',
  teal: '#008080',
  olive: '#808000',
  orange: '#ffa500',
  transparent: 'rgba(0, 0, 0, 0)'
};

/**
 * Parse any valid CSS color string into { r, g, b, a }
 * Supports hex (#rgb, #rgba, #rrggbb, #rrggbbaa), rgb(), rgba(), hsl(), and common names.
 */
export function parseColor(colorStr) {
  if (!colorStr || typeof colorStr !== 'string') return null;
  const str = colorStr.trim().toLowerCase();

  if (NAMED_COLORS[str]) {
    return parseColor(NAMED_COLORS[str]);
  }

  // Hex format
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1
      };
    } else if (hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: Math.round((parseInt(hex[3] + hex[3], 16) / 255) * 100) / 100
      };
    } else if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1
      };
    } else if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100) / 100
      };
    }
    return null;
  }

  // RGB / RGBA format
  const rgbMatch = str.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[/,]\s*([\d.%]+))?\s*\)$/);
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, parseFloat(rgbMatch[1])));
    const g = Math.min(255, Math.max(0, parseFloat(rgbMatch[2])));
    const b = Math.min(255, Math.max(0, parseFloat(rgbMatch[3])));
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      if (rgbMatch[4].endsWith('%')) {
        a = parseFloat(rgbMatch[4]) / 100;
      } else {
        a = parseFloat(rgbMatch[4]);
      }
      a = Math.min(1, Math.max(0, a));
    }
    return { r, g, b, a: Math.round(a * 100) / 100 };
  }

  // HSL format
  const hslMatch = str.match(/^hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%(?:\s*[/,]\s*([\d.%]+))?\s*\)$/);
  if (hslMatch) {
    const h = (parseFloat(hslMatch[1]) % 360 + 360) % 360;
    const s = Math.min(100, Math.max(0, parseFloat(hslMatch[2]))) / 100;
    const l = Math.min(100, Math.max(0, parseFloat(hslMatch[3]))) / 100;
    let a = 1;
    if (hslMatch[4] !== undefined) {
      a = hslMatch[4].endsWith('%') ? parseFloat(hslMatch[4]) / 100 : parseFloat(hslMatch[4]);
      a = Math.min(1, Math.max(0, a));
    }
    const rgb = hslToRgb(h, s, l);
    return { ...rgb, a: Math.round(a * 100) / 100 };
  }

  return null;
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rPrime = 0, gPrime = 0, bPrime = 0;

  if (h >= 0 && h < 60) {
    rPrime = c; gPrime = x; bPrime = 0;
  } else if (h >= 60 && h < 120) {
    rPrime = x; gPrime = c; bPrime = 0;
  } else if (h >= 120 && h < 180) {
    rPrime = 0; gPrime = c; bPrime = x;
  } else if (h >= 180 && h < 240) {
    rPrime = 0; gPrime = x; bPrime = c;
  } else if (h >= 240 && h < 300) {
    rPrime = x; gPrime = 0; bPrime = c;
  } else {
    rPrime = c; gPrime = 0; bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255)
  };
}

/**
 * Convert {r, g, b} to Hex string
 */
export function rgbToHex({ r, g, b, a = 1 }) {
  const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
  const base = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (a < 1) {
    const alphaHex = Math.round(a * 255).toString(16).padStart(2, '0');
    return `${base}${alphaHex}`;
  }
  return base;
}

/**
 * Convert {r, g, b} to HSL string
 */
export function rgbToHsl({ r, g, b, a = 1 }) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case rNorm: h = (gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0); break;
      case gNorm: h = (bNorm - rNorm) / delta + 2; break;
      case bNorm: h = (rNorm - gNorm) / delta + 4; break;
    }
    h = Math.round(h * 60);
  }

  const sPct = Math.round(s * 100);
  const lPct = Math.round(l * 100);

  if (a < 1) {
    return `hsla(${h}, ${sPct}%, ${lPct}%, ${a})`;
  }
  return `hsl(${h}, ${sPct}%, ${lPct}%)`;
}

/**
 * Calculate WCAG 2.1 relative luminance for {r, g, b}
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function getRelativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors (order independent)
 * Ratio = (L1 + 0.05) / (L2 + 0.05) where L1 is lighter
 */
export function getContrastRatio(colorA, colorB) {
  const cA = typeof colorA === 'string' ? parseColor(colorA) : colorA;
  const cB = typeof colorB === 'string' ? parseColor(colorB) : colorB;

  if (!cA || !cB) return null;

  const lumA = getRelativeLuminance(cA);
  const lumB = getRelativeLuminance(cB);

  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);

  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Evaluate WCAG compliance level for a contrast ratio
 */
export function evaluateWcag(ratio) {
  if (ratio === null) return { level: 'unknown', aaNormal: false, aaLarge: false, aaa: false };
  return {
    ratio,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3.0,
    aaa: ratio >= 7.0,
    level: ratio >= 7.0 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3.0 ? 'AA Large' : 'Fail'
  };
}

/**
 * Categorize a color into primary palette buckets: neutral-dark, neutral-light, accent, or vibrant
 */
export function categorizeColor(colorObj) {
  const { r, g, b } = colorObj;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = getRelativeLuminance(colorObj);
  const saturation = max === 0 ? 0 : (max - min) / max;

  if (saturation < 0.15) {
    return lum > 0.6 ? 'Neutral Light' : 'Neutral Dark';
  }
  return lum > 0.4 ? 'Accent Bright' : 'Accent Deep';
}
