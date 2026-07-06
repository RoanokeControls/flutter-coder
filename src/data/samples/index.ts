// Registry for the advanced sample corpus. Each category file exports a
// `<name>Samples` array; this module aggregates and provides search.

import type { FlutterSample, SampleCategory } from "./types.js";
import { renderingSamples } from "./rendering.js";
import { animationSamples } from "./animation.js";
import { architectureSamples } from "./architecture.js";
import { asyncPlatformSamples } from "./async-platform.js";
import { navigationSamples } from "./navigation.js";
import { performanceSamples } from "./performance.js";
import { testingSamples } from "./testing.js";
import { uiPatternSamples } from "./ui-patterns.js";
import { connectivitySamples } from "./connectivity.js";
import { deviceLinkSamples } from "./device-link.js";

export type { FlutterSample, SampleCategory } from "./types.js";
export { sampleCategories } from "./types.js";

export const allSamples: readonly FlutterSample[] = [
  ...renderingSamples,
  ...animationSamples,
  ...architectureSamples,
  ...asyncPlatformSamples,
  ...navigationSamples,
  ...performanceSamples,
  ...testingSamples,
  ...uiPatternSamples,
  ...connectivitySamples,
  ...deviceLinkSamples,
];

export function getSample(id: string): FlutterSample | undefined {
  return allSamples.find((s) => s.id === id);
}

export function listSamples(category?: SampleCategory): readonly FlutterSample[] {
  return category ? allSamples.filter((s) => s.category === category) : allSamples;
}

/** Word-boundary prefix match: "ble" hits "ble"/"ble-session", never "serializable". */
function termHits(term: string, haystack: string): boolean {
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(haystack);
}

/** Rank samples against a free-text need description. */
export function findSamples(query: string, limit = 5): FlutterSample[] {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const scored = allSamples.map((s) => {
    const haystackStrong = `${s.id} ${s.title} ${s.tags.join(" ")}`.toLowerCase();
    const haystackWeak = `${s.description} ${s.category}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (termHits(term, haystackStrong)) score += 3;
      else if (termHits(term, haystackWeak)) score += 1;
    }
    return { sample: s, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.sample);
}

/** One-line index of the whole corpus, grouped by category. */
export function formatSamplesIndex(): string {
  let text = `# Advanced Flutter Sample Corpus\n\n**${allSamples.length} verified samples.** Use \`flutter_get_sample\` with an id for full code.\n\n`;
  const byCat = new Map<string, FlutterSample[]>();
  for (const s of allSamples) {
    byCat.set(s.category, [...(byCat.get(s.category) ?? []), s]);
  }
  for (const [cat, samples] of byCat) {
    text += `## ${cat}\n\n`;
    for (const s of samples) {
      text += `- \`${s.id}\` (${s.difficulty}) — ${s.title}: ${s.description.split(". ")[0]}.\n`;
    }
    text += "\n";
  }
  return text;
}

export function formatSample(s: FlutterSample): string {
  const deps = s.packages.length
    ? s.packages.map((p) => `${p.name}: ${p.version}`).join(", ")
    : "none (Flutter SDK only)";
  return [
    `# ${s.title}`,
    "",
    `**id:** \`${s.id}\` · **category:** ${s.category} · **difficulty:** ${s.difficulty} · **min Flutter:** ${s.minFlutter}`,
    `**pub dependencies:** ${deps}`,
    "",
    s.description,
    "",
    "```dart",
    s.code,
    "```",
    "",
    `**Notes & gotchas:** ${s.notes}`,
  ].join("\n");
}
