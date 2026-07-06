import {
  findSamples,
  getSample,
  listSamples,
  formatSample,
  formatSamplesIndex,
  sampleCategories,
  type SampleCategory,
} from "../data/samples/index.js";
import {
  findKnowledge,
  getKnowledge,
  formatKnowledgeEntry,
  formatKnowledgeIndex,
} from "../data/knowledge/index.js";

export function sampleList(category?: string): string {
  if (category && !sampleCategories.includes(category as SampleCategory)) {
    return `Unknown category "${category}". Valid: ${sampleCategories.join(", ")}`;
  }
  const samples = listSamples(category as SampleCategory | undefined);
  if (!samples.length) return `No samples in category "${category}".`;
  let text = category ? `# Samples: ${category}\n\n` : formatSamplesIndex();
  if (category) {
    for (const s of samples) {
      text += `- \`${s.id}\` (${s.difficulty}, Flutter ≥${s.minFlutter}) — **${s.title}**: ${s.description}\n`;
    }
  }
  return text;
}

export function sampleGet(id: string): string {
  const sample = getSample(id);
  if (sample) return formatSample(sample);
  const near = findSamples(id.replace(/-/g, " "), 3);
  const hint = near.length
    ? `\n\nClosest matches:\n${near.map((s) => `- \`${s.id}\` — ${s.title}`).join("\n")}`
    : "";
  return `No sample with id "${id}". Use flutter_list_samples for the full index.${hint}`;
}

export function sampleFind(need: string): string {
  const hits = findSamples(need, 5);
  if (!hits.length) {
    return `No samples matched "${need}". Categories available: ${sampleCategories.join(", ")}. Use flutter_list_samples to browse.`;
  }
  let text = `# Samples matching: ${need}\n\n`;
  text += `Best match shown in full; others listed below.\n\n---\n\n`;
  text += formatSample(hits[0]);
  if (hits.length > 1) {
    text += `\n\n---\n\n**Other matches** (use \`flutter_get_sample\`):\n`;
    for (const s of hits.slice(1)) {
      text += `- \`${s.id}\` (${s.category}) — ${s.title}\n`;
    }
  }
  return text;
}

export function knowledgeLookup(query: string): string {
  const exact = getKnowledge(query.trim().toLowerCase().replace(/\s+/g, "-"));
  if (exact) return formatKnowledgeEntry(exact);
  const hits = findKnowledge(query, 3);
  if (!hits.length) {
    return `Nothing in the knowledge base matched "${query}".\n\n${formatKnowledgeIndex()}`;
  }
  let text = formatKnowledgeEntry(hits[0]);
  if (hits.length > 1) {
    text += `\n\n---\n\n**Related entries:** ${hits.slice(1).map((e) => `\`${e.id}\``).join(", ")}`;
  }
  return text;
}
