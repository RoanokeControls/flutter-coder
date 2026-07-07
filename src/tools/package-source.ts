// Search/read the vendored pub.dev package source under data/package-src/.
// The vendored tree is the exact published archive a consuming app gets —
// ground truth when docs and samples aren't enough and the answer lives in
// the implementation (what exception a call actually throws, how the Android
// side maps a GATT status, what the protobuf codec sends over the channel).
// scripts/vendor-package-src.mjs maintains the tree and its manifest.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(
  fileURLToPath(new URL(`../../data/package-src/`, import.meta.url))
);

const MAX_FILE_LINES = 500;
const MAX_SEARCH_BYTES = 1_500_000;
const SKIP_EXTENSIONS = new Set([".png", ".jpg", ".gif", ".ico", ".jar", ".zip"]);

const LANG_BY_EXT: Record<string, string> = {
  ".dart": "dart",
  ".kt": "kotlin",
  ".java": "java",
  ".swift": "swift",
  ".m": "objc",
  ".h": "objc",
  ".yaml": "yaml",
  ".json": "json",
  ".proto": "protobuf",
  ".gradle": "groovy",
  ".md": "markdown",
};

interface ManifestEntry {
  name: string;
  version: string;
  published: string;
  fetchedAt: string;
  files: number;
  bytes: number;
}

function manifest(): ManifestEntry[] {
  try {
    return JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
  } catch {
    return [];
  }
}

/** Resolve a user-supplied relative path, refusing escapes from ROOT. */
function safeResolve(relPath: string): string | null {
  const abs = resolve(ROOT, relPath);
  return abs === ROOT || abs.startsWith(ROOT + sep) ? abs : null;
}

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(p);
    else yield p;
  }
}

function rel(abs: string): string {
  return abs.slice(ROOT.length + 1).split(sep).join("/");
}

function overview(): string {
  const entries = manifest();
  let text = `# Vendored package source\n\n`;
  text += `Exact published pub.dev archives, browsable with \`flutter_source_read\` and searchable with \`flutter_source_search\`. Refresh: \`npm run vendor-src\`.\n\n`;
  for (const m of entries) {
    text += `## ${m.name} ${m.version}\n`;
    text += `Published ${m.published.slice(0, 10)}, vendored ${m.fetchedAt.slice(0, 10)} — ${m.files} files, ${(m.bytes / 1024).toFixed(0)} KB\n\n`;
    const pkgRoot = join(ROOT, m.name);
    if (existsSync(pkgRoot)) {
      const dirs = new Set<string>();
      for (const f of walkFiles(pkgRoot)) {
        const parts = rel(f).split("/");
        if (parts.length > 2) dirs.add(parts.slice(0, 3).join("/"));
        else dirs.add(parts.slice(0, parts.length - 1).join("/") + "/ (top-level files)");
      }
      for (const d of [...dirs].sort()) text += `- \`${d}\`\n`;
      text += `\n`;
    }
  }
  return text;
}

function listDir(abs: string): string {
  let text = `# ${rel(abs) || "package-src"}/\n\n`;
  for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (entry.isDirectory()) {
      const count = [...walkFiles(join(abs, entry.name))].length;
      text += `- \`${entry.name}/\` (${count} files)\n`;
    } else {
      text += `- \`${entry.name}\` (${statSync(join(abs, entry.name)).size} bytes)\n`;
    }
  }
  return text;
}

export function sourceRead(path?: string, startLine?: number, endLine?: number): string {
  if (!existsSync(ROOT) || !manifest().length) {
    return `No vendored source found. Run \`npm run vendor-src\` in the flutter-coder repo to fetch it.`;
  }
  if (!path || path.trim() === "" || path.trim() === "/") return overview();

  const abs = safeResolve(path.trim());
  if (!abs) return `Path "${path}" escapes the vendored source root — use paths relative to package-src (e.g. "flutter_reactive_ble/lib/src/reactive_ble.dart").`;
  if (!existsSync(abs)) {
    return `No such path "${path}". Call flutter_source_read without a path for the tree, or flutter_source_search to locate a symbol.`;
  }
  if (statSync(abs).isDirectory()) return listDir(abs);

  const lines = readFileSync(abs, "utf8").split("\n");
  const from = Math.max(1, startLine ?? 1);
  const requestedTo = endLine ?? from + MAX_FILE_LINES - 1;
  const to = Math.min(lines.length, from - 1 + Math.min(requestedTo - from + 1, MAX_FILE_LINES));
  const lang = LANG_BY_EXT[extname(abs)] ?? "";
  const width = String(to).length;

  let text = `# ${rel(abs)} (lines ${from}-${to} of ${lines.length})\n\n\`\`\`${lang}\n`;
  for (let i = from; i <= to; i++) {
    text += `${String(i).padStart(width)}  ${lines[i - 1]}\n`;
  }
  text += `\`\`\`\n`;
  if (to < lines.length) {
    text += `\nTruncated — request more with startLine=${to + 1}.\n`;
  }
  return text;
}

export function sourceSearch(query: string, packageFilter?: string, maxResults?: number): string {
  if (!existsSync(ROOT) || !manifest().length) {
    return `No vendored source found. Run \`npm run vendor-src\` in the flutter-coder repo to fetch it.`;
  }
  const cap = Math.min(Math.max(maxResults ?? 30, 1), 100);
  const perFileCap = 10;

  let re: RegExp;
  try {
    re = new RegExp(query, "i");
  } catch {
    re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  const packages = manifest()
    .map((m) => m.name)
    .filter((n) => !packageFilter || n === packageFilter);
  if (!packages.length) {
    return `Unknown package "${packageFilter}". Vendored: ${manifest().map((m) => m.name).join(", ")}`;
  }

  let total = 0;
  let filesHit = 0;
  let text = "";
  outer: for (const pkg of packages) {
    const pkgRoot = join(ROOT, pkg);
    if (!existsSync(pkgRoot)) continue;
    for (const file of walkFiles(pkgRoot)) {
      if (SKIP_EXTENSIONS.has(extname(file)) || statSync(file).size > MAX_SEARCH_BYTES) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      let inFile = 0;
      let fileText = "";
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i])) continue;
        fileText += `${i + 1}: ${lines[i].trim()}\n`;
        inFile++;
        total++;
        if (inFile >= perFileCap) {
          fileText += `… (more matches in this file — read it directly)\n`;
          break;
        }
        if (total >= cap) break;
      }
      if (inFile) {
        filesHit++;
        text += `\n## ${rel(file)}\n\`\`\`\n${fileText}\`\`\`\n`;
      }
      if (total >= cap) break outer;
    }
  }

  if (!total) {
    return `No matches for /${query}/i in vendored source${packageFilter ? ` of ${packageFilter}` : ""}. Patterns are case-insensitive regex; try a shorter fragment.`;
  }
  let head = `# Matches for /${query}/i — ${total} line(s) in ${filesHit} file(s)`;
  if (total >= cap) head += ` (capped at ${cap}; narrow with the package parameter or a tighter pattern)`;
  return `${head}\n${text}\nUse \`flutter_source_read\` with a path above to read the surrounding code.`;
}
