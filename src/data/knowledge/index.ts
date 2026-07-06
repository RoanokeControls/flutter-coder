import type { KnowledgeEntry } from "./types.js";
import { knowledgeEntries } from "./entries.js";

export type { KnowledgeEntry } from "./types.js";
export { knowledgeEntries } from "./entries.js";

export function getKnowledge(id: string): KnowledgeEntry | undefined {
  return knowledgeEntries.find((e) => e.id === id);
}

export function findKnowledge(query: string, limit = 3): KnowledgeEntry[] {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const scored = knowledgeEntries.map((e) => {
    const strong = `${e.id} ${e.title} ${e.topic} ${e.tags.join(" ")}`.toLowerCase();
    const weak = `${e.summary}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (strong.includes(term)) score += 3;
      else if (weak.includes(term)) score += 1;
    }
    return { entry: e, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry);
}

export function formatKnowledgeIndex(): string {
  let text = `# Flutter Knowledge Base\n\n**${knowledgeEntries.length} entries.** Use \`flutter_knowledge\` with an id or query for full content.\n\n`;
  const byTopic = new Map<string, KnowledgeEntry[]>();
  for (const e of knowledgeEntries) {
    byTopic.set(e.topic, [...(byTopic.get(e.topic) ?? []), e]);
  }
  for (const [topic, entries] of byTopic) {
    text += `## ${topic}\n\n`;
    for (const e of entries) {
      text += `- \`${e.id}\` — **${e.title}** (verified ${e.asOf}): ${e.summary}\n`;
    }
    text += "\n";
  }
  return text;
}

export function formatKnowledgeEntry(e: KnowledgeEntry): string {
  return `# ${e.title}\n\n*id: \`${e.id}\` · topic: ${e.topic} · guidance verified current as of ${e.asOf}*\n\n${e.content}`;
}
