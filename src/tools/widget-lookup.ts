// Widget catalog search with fuzzy matching

import { widgetCatalog, type WidgetEntry } from "../data/widget-catalog.js";

function scoreFuzzy(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;

  // Word-level matching
  const words = q.split(/\s+/);
  const matchedWords = words.filter((w) => t.includes(w));
  if (matchedWords.length === words.length) return 60;
  if (matchedWords.length > 0) return 30 + (matchedWords.length / words.length) * 30;

  return 0;
}

export function widgetLookup(query: string, category?: string): string {
  const results: { widget: WidgetEntry; score: number }[] = [];

  for (const widget of widgetCatalog) {
    if (category && !widget.category.toLowerCase().includes(category.toLowerCase())) {
      continue;
    }

    // Score against name, description, and category
    const nameScore = scoreFuzzy(query, widget.name);
    const descScore = scoreFuzzy(query, widget.description) * 0.5;
    const categoryScore = scoreFuzzy(query, widget.category) * 0.3;
    const propsScore = widget.commonProps.some((p) => p.toLowerCase().includes(query.toLowerCase())) ? 20 : 0;
    const tipsScore = widget.tips.toLowerCase().includes(query.toLowerCase()) ? 10 : 0;

    const score = Math.max(nameScore, descScore, categoryScore) + propsScore + tipsScore;

    if (score > 15) {
      results.push({ widget, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, 10);

  if (topResults.length === 0) {
    return `No widgets found matching "${query}". Try a broader search term or browse by category.`;
  }

  let text = `# Widget Search: "${query}"\n\n`;
  text += `Found **${topResults.length}** result${topResults.length === 1 ? "" : "s"}.\n\n`;

  for (const { widget } of topResults) {
    text += `## ${widget.name}\n`;
    text += `**Category:** ${widget.category}\n\n`;
    text += `${widget.description}\n\n`;
    text += `**Key Props:** ${widget.commonProps.join(", ")}\n\n`;
    text += `**Tips:** ${widget.tips}\n\n`;
    text += "---\n\n";
  }

  return text;
}
