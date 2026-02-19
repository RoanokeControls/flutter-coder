// pub.dev package lookup tool

import { fetchJson } from "../fetcher.js";
import { cache, TTL_API } from "../cache.js";

interface PubPackageResponse {
  readonly name: string;
  readonly latest: {
    readonly version: string;
    readonly pubspec: {
      readonly name: string;
      readonly description?: string;
      readonly version: string;
      readonly homepage?: string;
      readonly repository?: string;
      readonly documentation?: string;
      readonly environment?: Record<string, string>;
      readonly dependencies?: Record<string, unknown>;
    };
  };
  readonly versions: readonly { readonly version: string }[];
}

interface PubScoreResponse {
  readonly grantedPoints: number;
  readonly maxPoints: number;
  readonly likeCount: number;
  readonly popularityScore: number;
  readonly tags: readonly string[];
}

export async function pubPackageLookup(name: string): Promise<string> {
  const cacheKey = cache.makeKey("pub_package", { name });
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  try {
    const [pkg, score] = await Promise.all([
      fetchJson<PubPackageResponse>(`https://pub.dev/api/packages/${encodeURIComponent(name)}`),
      fetchJson<PubScoreResponse>(`https://pub.dev/api/packages/${encodeURIComponent(name)}/score`).catch(() => null),
    ]);

    const pubspec = pkg.latest.pubspec;
    const recentVersions = pkg.versions.slice(0, 10).map((v) => v.version);

    let text = `# ${pkg.name}\n\n`;
    text += `**Latest Version:** ${pkg.latest.version}\n\n`;

    if (pubspec.description) {
      text += `**Description:** ${pubspec.description}\n\n`;
    }

    if (score) {
      text += "## Score\n\n";
      text += `- **Pub Points:** ${score.grantedPoints}/${score.maxPoints}\n`;
      text += `- **Likes:** ${score.likeCount}\n`;
      text += `- **Popularity:** ${Math.round(score.popularityScore * 100)}%\n`;
      if (score.tags.length > 0) {
        text += `- **Tags:** ${score.tags.join(", ")}\n`;
      }
      text += "\n";
    }

    if (pubspec.homepage || pubspec.repository || pubspec.documentation) {
      text += "## Links\n\n";
      if (pubspec.homepage) text += `- **Homepage:** ${pubspec.homepage}\n`;
      if (pubspec.repository) text += `- **Repository:** ${pubspec.repository}\n`;
      if (pubspec.documentation) text += `- **Documentation:** ${pubspec.documentation}\n`;
      text += `- **pub.dev:** https://pub.dev/packages/${name}\n`;
      text += "\n";
    }

    if (pubspec.environment) {
      text += "## Environment\n\n";
      for (const [key, value] of Object.entries(pubspec.environment)) {
        text += `- **${key}:** ${value}\n`;
      }
      text += "\n";
    }

    if (pubspec.dependencies && Object.keys(pubspec.dependencies).length > 0) {
      text += "## Dependencies\n\n";
      for (const [dep, version] of Object.entries(pubspec.dependencies)) {
        text += `- ${dep}: ${typeof version === "string" ? version : JSON.stringify(version)}\n`;
      }
      text += "\n";
    }

    text += "## Recent Versions\n\n";
    text += recentVersions.join(", ") + "\n\n";

    text += "## Installation\n\n";
    text += "```yaml\n# pubspec.yaml\ndependencies:\n";
    text += `  ${name}: ^${pkg.latest.version}\n`;
    text += "```\n\n";
    text += "```bash\n# Or via CLI\nflutter pub add " + name + "\n```\n";

    cache.set(cacheKey, text, TTL_API);
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("404")) {
      return `Package "${name}" not found on pub.dev. Check the package name and try again.`;
    }
    return `Failed to fetch package "${name}" from pub.dev: ${message}`;
  }
}
