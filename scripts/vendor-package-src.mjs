#!/usr/bin/env node
// Vendors published pub.dev package source into data/package-src/ so the
// MCP server can serve the actual shipped code (flutter_source_search /
// flutter_source_read). The archives fetched are the exact bytes pub gives
// a consuming app — Dart, native Android/iOS, protobuf plumbing and all.
//
// Usage:
//   node scripts/vendor-package-src.mjs              # refresh default set at latest
//   node scripts/vendor-package-src.mjs pkg@1.2.3    # pin a specific version
//
// Writes data/package-src/manifest.json recording name/version/published/
// fetchedAt per package. check-updates.mjs compares the manifest against
// live pub.dev versions and alerts on drift; re-running this script (then
// re-verifying the samples that teach the package) closes the loop.

import { mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "package-src");

// The reactive_ble federation: API package -> platform interface -> mobile
// implementation (Kotlin/Java Android + Swift/ObjC iOS + protobuf codecs).
const DEFAULT_SET = [
  "flutter_reactive_ble",
  "reactive_ble_platform_interface",
  "reactive_ble_mobile",
];

const requested = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const targets = (requested.length ? requested : DEFAULT_SET).map((spec) => {
  const [name, version] = spec.split("@");
  return { name, version: version ?? null };
});

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function walkStats(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = walkStats(p);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(p).size;
    }
  }
  return { files, bytes };
}

const manifest = [];
for (const target of targets) {
  const info = await fetchJson(`https://pub.dev/api/packages/${target.name}`);
  const version = target.version ?? info.latest.version;
  const versionInfo =
    version === info.latest.version
      ? info.latest
      : await fetchJson(`https://pub.dev/api/packages/${target.name}/versions/${version}`);

  const archiveUrl = `https://pub.dev/api/archives/${target.name}-${version}.tar.gz`;
  const res = await fetch(archiveUrl, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${archiveUrl} -> HTTP ${res.status}`);
  const tarball = join(tmpdir(), `${target.name}-${version}.tar.gz`);
  writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));

  const dest = join(ROOT, target.name);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  execFileSync("tar", ["-xzf", tarball, "-C", dest]);
  rmSync(tarball, { force: true });

  const { files, bytes } = walkStats(dest);
  manifest.push({
    name: target.name,
    version,
    published: versionInfo.published,
    fetchedAt: new Date().toISOString(),
    files,
    bytes,
  });
  console.error(`vendored ${target.name} ${version} (${files} files, ${(bytes / 1024).toFixed(0)} KB)`);
}

mkdirSync(ROOT, { recursive: true });
writeFileSync(join(ROOT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.error(`manifest written: ${join(ROOT, "manifest.json")}`);
