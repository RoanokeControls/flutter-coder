// Flutter code generation tool

import { codegenTemplates } from "../data/patterns.js";
import { dartFeatures } from "../data/dart-features.js";

export function flutterCodegen(
  template: string,
  name: string,
  props?: readonly string[]
): string {
  const templateDef = codegenTemplates[template.toLowerCase()];

  if (!templateDef) {
    const available = Object.entries(codegenTemplates)
      .map(([key, t]) => `- **${key}**: ${t.description}`)
      .join("\n");
    return `Unknown template "${template}". Available templates:\n\n${available}`;
  }

  const code = templateDef.generate(name, props);

  return `# Generated: ${templateDef.name}\n\n\`\`\`dart\n${code}\n\`\`\`\n`;
}

export function dartLanguageRef(feature: string): string {
  const q = feature.toLowerCase();

  // Exact match
  const exact = dartFeatures.find((f) => f.name.toLowerCase() === q);
  if (exact) {
    return formatFeature(exact);
  }

  // Fuzzy search
  const results = dartFeatures
    .map((f) => ({
      feature: f,
      score: scoreFeature(q, f),
    }))
    .filter(({ score }) => score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (results.length === 0) {
    const available = dartFeatures.map((f) => `- **${f.name}** (Dart ${f.version}) — ${f.category}`).join("\n");
    return `No Dart feature found matching "${feature}". Available features:\n\n${available}`;
  }

  if (results.length === 1 || results[0].score > 80) {
    return formatFeature(results[0].feature);
  }

  let text = `# Dart Features matching "${feature}"\n\n`;
  for (const { feature: f } of results) {
    text += formatFeature(f);
    text += "---\n\n";
  }
  return text;
}

function formatFeature(f: typeof dartFeatures[number]): string {
  let text = `# ${f.name} (Dart ${f.version})\n\n`;
  text += `**Category:** ${f.category}\n\n`;
  text += `${f.description}\n\n`;
  text += "## Syntax\n\n```dart\n" + f.syntax + "\n```\n\n";
  text += "## Example\n\n```dart\n" + f.example + "\n```\n\n";
  text += `**Tips:** ${f.tips}\n`;
  return text;
}

function scoreFeature(query: string, feature: typeof dartFeatures[number]): number {
  const name = feature.name.toLowerCase();
  const q = query.toLowerCase();

  if (name === q) return 100;
  if (name.startsWith(q)) return 90;
  if (name.includes(q)) return 70;

  // Keyword matching
  const matchedKeywords = feature.keywords.filter((k) => q.includes(k));
  if (matchedKeywords.length > 0) {
    return 40 + (matchedKeywords.length / feature.keywords.length) * 50;
  }

  // Category matching
  if (feature.category.toLowerCase().includes(q)) return 30;

  // Description matching
  if (feature.description.toLowerCase().includes(q)) return 25;

  return 0;
}
