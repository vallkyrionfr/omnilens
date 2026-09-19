/**
 * OmniLens Core - Reader Mode & Content Synthesizer
 * Uses density heuristics to isolate main article content, computes readability and key metrics.
 */

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can\'t', 'cannot', 'could',
  'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each', 'few', 'for',
  'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s',
  'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m',
  'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t',
  'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t',
  'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
  'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t',
  'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s',
  'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself',
  'yourselves'
]);

/**
 * Estimate syllable count for a word
 */
export function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const match = w.replace(/(?:[^laeiouy]|ed|es|e)$/, '')
                 .replace(/^y/, '')
                 .match(/[aeiouy]{1,2}/g);
  return match ? Math.max(1, match.length) : 1;
}

/**
 * Compute Flesch-Kincaid Reading Ease score
 * 90-100: Very Easy, 60-70: Standard, 0-30: Very Difficult / Academic
 */
export function calculateFleschScore(totalWords, totalSentences, totalSyllables) {
  if (totalWords === 0 || totalSentences === 0) return 100;
  const wordsPerSentence = totalWords / totalSentences;
  const syllablesPerWord = totalSyllables / totalWords;
  const score = 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord);
  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Extract the primary article container from the document using heuristics
 */
export function extractArticleContent(doc = document) {
  // If explicitly tagged with <article> or [role="article"]
  let candidate = doc.querySelector('article, [role="article"], main, .article, .post-content, #content');

  if (!candidate || candidate.textContent.trim().length < 300) {
    // Score all potential block elements
    const elements = Array.from(doc.querySelectorAll('div, section, main, article'));
    let bestScore = -1;
    let bestEl = doc.body;

    elements.forEach(el => {
      // Discard common noise containers
      const idClass = `${el.id} ${el.className}`.toLowerCase();
      if (/nav|menu|footer|sidebar|comment|modal|ad-|header|cookie|widget/.test(idClass)) {
        return;
      }

      const paragraphs = el.querySelectorAll('p');
      if (paragraphs.length === 0) return;

      let textLen = 0;
      paragraphs.forEach(p => { textLen += p.textContent.trim().length; });

      // Calculate heuristic score
      let score = paragraphs.length * 10 + (textLen / 20);

      // Link density penalty
      const links = el.querySelectorAll('a');
      let linkTextLen = 0;
      links.forEach(a => { linkTextLen += a.textContent.trim().length; });
      const linkDensity = textLen > 0 ? linkTextLen / textLen : 1;

      score = score * (1 - linkDensity);

      if (score > bestScore) {
        bestScore = score;
        bestEl = el;
      }
    });

    candidate = bestEl;
  }

  // Extract clean text
  const rawText = candidate ? candidate.textContent : '';
  const cleanText = rawText.replace(/\s+/g, ' ').trim();

  // Metrics
  const words = cleanText.match(/\b[A-Za-z0-9'-]+\b/g) || [];
  const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const wordCount = words.length;
  const sentenceCount = Math.max(1, sentences.length);

  let totalSyllables = 0;
  const wordFreq = new Map();

  words.forEach(w => {
    const lower = w.toLowerCase();
    totalSyllables += countSyllables(lower);

    if (lower.length > 2 && !STOP_WORDS.has(lower) && !/^\d+$/.test(lower)) {
      wordFreq.set(lower, (wordFreq.get(lower) || 0) + 1);
    }
  });

  // Top keywords
  const topKeywords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count, percentage: Math.round((count / wordCount) * 1000) / 10 }));

  // Readability
  const readingEase = calculateFleschScore(wordCount, sentenceCount, totalSyllables);
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  // Extract clean paragraphs for reader view
  const paragraphs = Array.from(candidate.querySelectorAll('p, h2, h3, blockquote'))
    .map(p => {
      const text = p.textContent.trim();
      return text.length > 20 ? { tag: p.tagName.toLowerCase(), text } : null;
    })
    .filter(Boolean);

  return {
    title: doc.title || 'Untitled Document',
    wordCount,
    sentenceCount,
    readingTimeMinutes,
    readingEase,
    readingLevel: readingEase >= 80 ? 'Easy' : readingEase >= 60 ? 'Standard' : readingEase >= 40 ? 'Fairly Difficult' : 'Difficult',
    topKeywords,
    paragraphs: paragraphs.slice(0, 50),
    previewText: cleanText.slice(0, 400) + '...'
  };
}
