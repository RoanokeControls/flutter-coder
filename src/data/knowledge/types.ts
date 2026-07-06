// Contract for the Flutter knowledge base: opinionated, current guidance for
// starting and structuring Flutter programs. Entries are markdown documents.

export interface KnowledgeEntry {
  readonly id: string;              // unique kebab-case, e.g. "project-structure"
  readonly title: string;
  readonly topic: string;           // grouping, e.g. "Architecture", "Tooling", "UI"
  readonly summary: string;         // one paragraph — shown in the index
  readonly tags: readonly string[];
  readonly asOf: string;            // "YYYY-MM" the guidance was last verified current
  readonly content: string;         // full markdown body
}
