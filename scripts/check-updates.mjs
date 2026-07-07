#!/usr/bin/env node
// CLI update probe for the flutter-coder MCP server, for scheduled runs.
// Compares live Flutter/Dart releases and tracked pub.dev package versions
// against the committed baseline in data/version-state.json. Prints a JSON
// report; exits 1 when anything actionable appeared (so schedulers can
// alert), 0 when all quiet, 2 on probe errors only.
//
// Actionable means the server's static content may be stale:
//   - Flutter stable version changed (widget catalog, breaking changes, KB)
//   - Dart SDK minor changed (dart-features.ts may be missing new features)
//   - A tracked package published a new MAJOR version (knowledge-base picks)
//   - A tracked package looks abandoned (no publish in >18 months)
//
// By default the baseline file is rewritten to the live values after
// reporting, so acting on the report and committing closes the loop.
// Pass --no-mark-seen to leave the baseline untouched (e.g. dry runs).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const STATE_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "version-state.json");
const VENDOR_MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "package-src", "manifest.json");
const RELEASES_URL = "https://storage.googleapis.com/flutter_infra_release/releases/releases_macos.json";
const STALE_MONTHS = 18;

const markSeen = !process.argv.includes("--no-mark-seen");
const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));

const probeErrors = [];

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// ── Flutter / Dart releases ─────────────────────────────────────────────
let flutter = null;
try {
  const releases = await fetchJson(RELEASES_URL);
  const byHash = new Map(releases.releases.map((r) => [r.hash, r]));
  const stable = byHash.get(releases.current_release.stable) ?? {};
  const beta = byHash.get(releases.current_release.beta) ?? {};
  flutter = {
    stable: {
      baseline: state.flutter.stable,
      live: stable.version ?? null,
      changed: stable.version !== state.flutter.stable,
    },
    dart: {
      baseline: state.flutter.dart,
      live: stable.dart_sdk_version ?? null,
      minorChanged:
        (stable.dart_sdk_version ?? "").split(".").slice(0, 2).join(".") !==
        state.flutter.dart.split(".").slice(0, 2).join("."),
    },
    beta: {
      baseline: state.flutter.beta,
      live: beta.version ?? null,
      changed: beta.version !== state.flutter.beta, // informational only
    },
  };
} catch (err) {
  probeErrors.push(`releases: ${err.message}`);
}

// ── Tracked pub.dev packages ────────────────────────────────────────────
const packages = await Promise.all(
  Object.entries(state.packages).map(async ([name, baseline]) => {
    try {
      const pkg = await fetchJson(`https://pub.dev/api/packages/${name}`);
      const live = pkg.latest.version;
      const published = pkg.latest.published;
      const major = (v) => parseInt(v.split(".")[0], 10);
      const monthsSince = (iso) => (Date.now() - new Date(iso).getTime()) / (30.44 * 24 * 3600 * 1000);
      return {
        name,
        baseline,
        live,
        published,
        majorBump: major(live) > major(baseline),
        staleMonths: monthsSince(published) > STALE_MONTHS ? Math.round(monthsSince(published)) : null,
      };
    } catch (err) {
      probeErrors.push(`pub.dev/${name}: ${err.message}`);
      return null;
    }
  })
);
const probed = packages.filter(Boolean);

// ── Vendored package source (data/package-src/) ─────────────────────────
// The manifest is maintained only by scripts/vendor-package-src.mjs, so
// drift stays actionable every month until the source is re-vendored.
let vendored = [];
try {
  const vendorManifest = JSON.parse(readFileSync(VENDOR_MANIFEST_PATH, "utf8"));
  vendored = await Promise.all(
    vendorManifest.map(async ({ name, version }) => {
      try {
        const live = probed.find((p) => p.name === name)?.live
          ?? (await fetchJson(`https://pub.dev/api/packages/${name}`)).latest.version;
        return { name, vendored: version, live, drifted: live !== version };
      } catch (err) {
        probeErrors.push(`pub.dev/${name} (vendored): ${err.message}`);
        return null;
      }
    })
  );
  vendored = vendored.filter(Boolean);
} catch {
  // No vendored source yet — nothing to check.
}

// ── Report ──────────────────────────────────────────────────────────────
const actionable = [];
if (flutter?.stable.changed)
  actionable.push(`Flutter stable ${flutter.stable.baseline} -> ${flutter.stable.live}: review widget catalog, error catalog, KB entries citing the SDK version.`);
if (flutter?.dart.minorChanged)
  actionable.push(`Dart ${flutter.dart.baseline} -> ${flutter.dart.live}: check for new language features to add to dart-features.ts.`);
for (const p of probed) {
  if (p.majorBump)
    actionable.push(`${p.name} ${p.baseline} -> ${p.live} (major): review samples/KB entries that pin or teach this package.`);
  if (p.staleMonths)
    actionable.push(`${p.name} last published ${p.staleMonths} months ago: reconsider as a recommended pick.`);
}
for (const v of vendored) {
  if (v.drifted)
    actionable.push(`vendored source for ${v.name} is ${v.vendored} but ${v.live} is live: run \`npm run vendor-src\`, then re-verify the samples teaching it.`);
}

const report = {
  checkedAt: new Date().toISOString(),
  flutter,
  packages: probed,
  vendoredSource: vendored,
  actionable,
  probeErrors,
};
console.log(JSON.stringify(report, null, 2));

if (markSeen && (actionable.length || flutter?.beta.changed)) {
  const next = {
    ...state,
    flutter: {
      stable: flutter?.stable.live ?? state.flutter.stable,
      dart: flutter?.dart.live ?? state.flutter.dart,
      beta: flutter?.beta.live ?? state.flutter.beta,
    },
    packages: Object.fromEntries(
      Object.entries(state.packages).map(([name, baseline]) => {
        const p = probed.find((x) => x.name === name);
        return [name, p ? p.live : baseline];
      })
    ),
    lastChecked: report.checkedAt,
  };
  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + "\n");
}

if (actionable.length) process.exit(1);
if (probeErrors.length) process.exit(2);
