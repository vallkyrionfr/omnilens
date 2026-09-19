/**
 * OmniLens Automated Test Suite
 * Validates core calculation engines, WCAG contrast mathematics, and readability algorithms.
 */

import {
  parseColor,
  getRelativeLuminance,
  getContrastRatio,
  evaluateWcag,
  rgbToHex,
  rgbToHsl
} from '../src/core/colors.js';

import {
  countSyllables,
  calculateFleschScore
} from '../src/core/reader.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  const isMatch = actual === expected || (typeof actual === 'number' && Math.abs(actual - expected) < 0.01);
  if (isMatch) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message} (Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

console.log('\n===========================================');
console.log('🧪 Running OmniLens Test Suite');
console.log('===========================================\n');

// 1. Color Parser Tests
console.log('--- Suite 1: Color Parsing & Conversion ---');
const whiteHex = parseColor('#ffffff');
assertEqual(whiteHex?.r, 255, 'Parses 6-digit hex red channel');
assertEqual(whiteHex?.g, 255, 'Parses 6-digit hex green channel');
assertEqual(whiteHex?.b, 255, 'Parses 6-digit hex blue channel');
assertEqual(whiteHex?.a, 1, 'Hex defaults alpha to 1');

const shortHex = parseColor('#f00');
assertEqual(shortHex?.r, 255, 'Parses short hex red');
assertEqual(shortHex?.g, 0, 'Parses short hex green');

const rgbTest = parseColor('rgb(79, 70, 229)');
assertEqual(rgbTest?.r, 79, 'Parses rgb() format');
assertEqual(rgbTest?.g, 70, 'Parses rgb() format');
assertEqual(rgbTest?.b, 229, 'Parses rgb() format');

const rgbaTest = parseColor('rgba(15, 23, 42, 0.5)');
assertEqual(rgbaTest?.a, 0.5, 'Parses rgba() alpha value');

const hslTest = parseColor('hsl(120, 100%, 50%)');
assertEqual(hslTest?.r, 0, 'Converts HSL green to RGB (r)');
assertEqual(hslTest?.g, 255, 'Converts HSL green to RGB (g)');
assertEqual(hslTest?.b, 0, 'Converts HSL green to RGB (b)');

const hexOutput = rgbToHex({ r: 99, g: 102, b: 241 });
assertEqual(hexOutput.toLowerCase(), '#6366f1', 'Converts RGB to Hex string correctly');

const hslOutput = rgbToHsl({ r: 255, g: 0, b: 0 });
assertEqual(hslOutput, 'hsl(0, 100%, 50%)', 'Converts RGB red to HSL string');

// 2. Relative Luminance & WCAG Contrast Tests
console.log('\n--- Suite 2: Luminance & WCAG 2.1 Contrast ---');
const blackLum = getRelativeLuminance({ r: 0, g: 0, b: 0 });
assertEqual(blackLum, 0, 'Pure black relative luminance is exactly 0.0');

const whiteLum = getRelativeLuminance({ r: 255, g: 255, b: 255 });
assertEqual(whiteLum, 1, 'Pure white relative luminance is exactly 1.0');

const blackWhiteContrast = getContrastRatio('#000000', '#ffffff');
assertEqual(blackWhiteContrast, 21.0, 'Black on white contrast ratio is exactly 21:1');

const sameColorContrast = getContrastRatio('#4f46e5', '#4f46e5');
assertEqual(sameColorContrast, 1.0, 'Identical colors contrast ratio is 1:1');

const wcagPassing = evaluateWcag(blackWhiteContrast);
assert(wcagPassing.aaNormal === true, 'Black on white passes WCAG AA Normal');
assert(wcagPassing.aaa === true, 'Black on white passes WCAG AAA');
assertEqual(wcagPassing.level, 'AAA', 'Black on white achieves AAA rating');

const lowContrastRatio = getContrastRatio('#94a3b8', '#ffffff');
const wcagFailing = evaluateWcag(lowContrastRatio);
assert(wcagFailing.aaNormal === false, 'Muted slate text (#94a3b8) on white fails WCAG AA Normal');
assertEqual(wcagFailing.level, 'Fail', 'Muted slate text achieves Fail rating');

// 3. Reader & Readability Algorithm Tests
console.log('\n--- Suite 3: Readability & Syllable Heuristics ---');
assertEqual(countSyllables('web'), 1, 'Single syllable word "web"');
assertEqual(countSyllables('extension'), 3, 'Multi-syllable word "extension"');
assertEqual(countSyllables('accessibility'), 6, 'Complex word "accessibility"');

// Flesch Reading Ease
const easyScore = calculateFleschScore(100, 10, 120); // 10 words/sentence, 1.2 syllables/word
assert(easyScore >= 80, `Easy text produces high score (got ${easyScore})`);

const academicScore = calculateFleschScore(100, 3, 220); // 33 words/sentence, 2.2 syllables/word
assert(academicScore < 40, `Academic dense text produces lower score (got ${academicScore})`);

console.log('\n===========================================');
console.log(`Results: ${passed} Passed, ${failed} Failed`);
console.log('===========================================\n');

if (failed > 0) {
  process.exit(1);
}
