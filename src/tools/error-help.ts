// Flutter error diagnosis with fuzzy matching against error catalog

import { errorCatalog, type ErrorEntry } from "../data/error-catalog.js";

function scoreError(query: string, entry: ErrorEntry): number {
  const q = query.toLowerCase();

  // Direct pattern match (highest priority)
  const pattern = entry.pattern.toLowerCase();
  if (q.includes(pattern) || pattern.includes(q)) return 100;

  // Partial pattern match
  const patternWords = pattern.split(/[\s.*|\\()]+/).filter(Boolean);
  const matchedPatternWords = patternWords.filter((w) => q.includes(w.toLowerCase()));
  if (matchedPatternWords.length > 0) {
    const patternScore = 40 + (matchedPatternWords.length / patternWords.length) * 50;
    if (patternScore > 60) return patternScore;
  }

  // Keyword matching
  const matchedKeywords = entry.keywords.filter((k) => q.includes(k.toLowerCase()));
  if (matchedKeywords.length > 0) {
    return 30 + (matchedKeywords.length / entry.keywords.length) * 40;
  }

  // Title match
  const titleWords = entry.title.toLowerCase().split(/\s+/);
  const matchedTitleWords = titleWords.filter((w) => q.includes(w));
  if (matchedTitleWords.length >= 2) {
    return 20 + (matchedTitleWords.length / titleWords.length) * 30;
  }

  return 0;
}

export function flutterErrorHelp(errorMessage: string): string {
  const results: { entry: ErrorEntry; score: number }[] = [];

  for (const entry of errorCatalog) {
    const score = scoreError(errorMessage, entry);
    if (score > 20) {
      results.push({ entry, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, 3);

  if (topResults.length === 0) {
    return `No matching error patterns found for: "${errorMessage.slice(0, 100)}"\n\nTry including the exact error message from the Flutter console. Common error types include: overflow, null, state, navigation, build, and layout errors.`;
  }

  let text = "# Flutter Error Diagnosis\n\n";

  for (const { entry, score } of topResults) {
    const confidence = score >= 80 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";
    text += `## ${entry.title} [${confidence} match]\n\n`;
    text += `**Error Pattern:** \`${entry.pattern}\`\n\n`;
    text += `**Root Cause:** ${entry.cause}\n\n`;
    text += `**Solution:** ${entry.solution}\n\n`;
    if (entry.code) {
      text += "```dart\n" + entry.code + "\n```\n\n";
    }
    text += "---\n\n";
  }

  return text;
}
