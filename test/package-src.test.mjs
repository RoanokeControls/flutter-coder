// Integrity suite for the vendored package source (data/package-src/) and
// the flutter_source_search / flutter_source_read tools over it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { sourceRead, sourceSearch } = await import("../dist/tools/package-source.js");

const manifest = JSON.parse(
  readFileSync(new URL("../data/package-src/manifest.json", import.meta.url), "utf8")
);
const versionState = JSON.parse(
  readFileSync(new URL("../data/version-state.json", import.meta.url), "utf8")
);

const FEDERATION = [
  "flutter_reactive_ble",
  "reactive_ble_platform_interface",
  "reactive_ble_mobile",
];

test("vendored: manifest covers the reactive_ble federation in lockstep", () => {
  for (const name of FEDERATION) {
    assert.ok(manifest.some((m) => m.name === name), `${name} missing from manifest`);
  }
  const versions = new Set(manifest.filter((m) => FEDERATION.includes(m.name)).map((m) => m.version));
  assert.equal(versions.size, 1, `federation packages not in version lockstep: ${[...versions]}`);
});

test("vendored: version matches the tracked baseline and the corpus sample", async () => {
  const vendored = manifest.find((m) => m.name === "flutter_reactive_ble").version;
  assert.equal(
    versionState.packages.flutter_reactive_ble,
    vendored,
    "data/version-state.json flutter_reactive_ble disagrees with vendored source"
  );
  const { getSample } = await import("../dist/data/samples/index.js");
  const sample = getSample("ble-device-session-reactive");
  assert.ok(sample, "ble-device-session-reactive sample missing");
  const declared = sample.packages.find((p) => p.name === "flutter_reactive_ble").version;
  assert.equal(
    declared.replace("^", "").split(".")[0],
    vendored.split(".")[0],
    `sample teaches flutter_reactive_ble ${declared} but vendored source is ${vendored} (major mismatch)`
  );
});

test("vendored: overview lists every package with its version", () => {
  const text = sourceRead();
  for (const m of manifest) {
    assert.ok(text.includes(`${m.name} ${m.version}`), `overview missing ${m.name} ${m.version}`);
  }
});

test("vendored: reads a file with paging metadata", () => {
  const text = sourceRead("flutter_reactive_ble/pubspec.yaml");
  assert.ok(text.includes("name: flutter_reactive_ble"), "pubspec content missing");
  assert.match(text, /lines 1-\d+ of \d+/, "no line-range header");
});

test("vendored: directory paths list their contents", () => {
  const text = sourceRead("reactive_ble_mobile/android");
  assert.ok(text.includes("src/"), `android dir listing missing src/: ${text.slice(0, 200)}`);
});

test("vendored: path traversal is refused", () => {
  const text = sourceRead("../../package.json");
  assert.ok(text.includes("escapes"), "traversal not refused");
  assert.ok(!text.includes('"flutter-coder-mcp"'), "traversal leaked file content");
});

test("vendored: search finds the Dart API, native Kotlin, and native Swift layers", () => {
  const dart = sourceSearch("connectToDevice", "flutter_reactive_ble");
  assert.ok(dart.includes("lib/"), `no Dart hit for connectToDevice: ${dart.slice(0, 200)}`);
  const kotlin = sourceSearch("connectGatt|GATT", "reactive_ble_mobile");
  assert.ok(kotlin.includes(".kt"), "no Kotlin hit in reactive_ble_mobile");
  const swift = sourceSearch("CBCentralManager", "reactive_ble_mobile");
  assert.ok(swift.includes(".swift"), "no Swift hit for CBCentralManager");
});

test("vendored: search handles unknown package and no-match gracefully", () => {
  assert.ok(sourceSearch("anything", "not_a_package").includes("Unknown package"));
  assert.ok(sourceSearch("zzz_no_such_symbol_zzz").includes("No matches"));
});
