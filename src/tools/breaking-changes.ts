// Flutter breaking changes lookup

import { fetchText, stripHtml } from "../fetcher.js";
import { cache, TTL_DOCS } from "../cache.js";

const BREAKING_CHANGES_URL = "https://docs.flutter.dev/release/breaking-changes";

export async function flutterBreakingChanges(version?: string, query?: string): Promise<string> {
  const cacheKey = cache.makeKey("breaking_changes", { version: version ?? "", query: query ?? "" });
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  try {
    const html = await fetchText(BREAKING_CHANGES_URL);

    // Extract breaking change links and titles
    const linkPattern = /<a[^>]*href="([^"]*breaking-changes[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const entries: { title: string; url: string }[] = [];
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
      const title = stripHtml(match[2]).trim();
      let url = match[1];
      if (url.startsWith("/")) {
        url = `https://docs.flutter.dev${url}`;
      }
      if (title && !title.includes("Breaking changes")) {
        entries.push({ title, url });
      }
    }

    // Also try to extract from list items
    const liPattern = /<li[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi;
    while ((match = liPattern.exec(html)) !== null) {
      const title = stripHtml(match[2]).trim();
      let url = match[1];
      if (url.startsWith("/")) {
        url = `https://docs.flutter.dev${url}`;
      }
      if (title && title.length > 5 && !entries.some((e) => e.title === title)) {
        entries.push({ title, url });
      }
    }

    // Filter by version if provided
    let filtered = entries;
    if (version) {
      const versionNorm = version.replace(/^v/, "").trim();
      filtered = entries.filter(
        (e) =>
          e.title.includes(versionNorm) ||
          e.url.includes(versionNorm)
      );
    }

    // Filter by query if provided
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (e) => e.title.toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      let text = "# Flutter Breaking Changes\n\n";
      if (version || query) {
        text += `No breaking changes found matching ${version ? `version "${version}"` : ""}${version && query ? " and " : ""}${query ? `query "${query}"` : ""}.\n\n`;
        text += "Try a broader search, or omit version/query to see all breaking changes.\n\n";
      } else {
        text += "No breaking changes could be extracted from the Flutter docs page.\n\n";
      }
      text += `**Full list:** ${BREAKING_CHANGES_URL}\n`;
      cache.set(cacheKey, text, TTL_DOCS);
      return text;
    }

    let text = "# Flutter Breaking Changes\n\n";
    if (version) text += `**Version filter:** ${version}\n`;
    if (query) text += `**Search:** ${query}\n`;
    text += `**Found:** ${filtered.length} breaking change${filtered.length === 1 ? "" : "s"}\n\n`;

    for (const entry of filtered.slice(0, 30)) {
      text += `- [${entry.title}](${entry.url})\n`;
    }

    if (filtered.length > 30) {
      text += `\n... and ${filtered.length - 30} more. See full list at ${BREAKING_CHANGES_URL}\n`;
    }

    text += `\n**Full list:** ${BREAKING_CHANGES_URL}\n`;

    cache.set(cacheKey, text, TTL_DOCS);
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to fetch breaking changes: ${message}\n\nYou can view them directly at: ${BREAKING_CHANGES_URL}`;
  }
}
