// Integrity suite for the sample corpus and knowledge base.
// Run via `npm test` (builds first, tests the compiled dist/).
import { test } from "node:test";
import assert from "node:assert/strict";

const { allSamples, sampleCategories, findSamples, getSample } = await import(
  "../dist/data/samples/index.js"
);
const { knowledgeEntries, findKnowledge } = await import("../dist/data/knowledge/index.js");

const DEPRECATED_API_TOKENS = [
  "textScaleFactor:",
  "MaterialStateProperty",
  "WillPopScope",
  ".withOpacity(",
  "RaisedButton",
  "FlatButton",
  "accentColor",
];

test("samples: corpus is non-trivial", () => {
  assert.ok(allSamples.length >= 25, `expected >=25 samples, got ${allSamples.length}`);
});

test("samples: ids unique and kebab-case", () => {
  const ids = allSamples.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate sample ids");
  for (const id of ids) {
    assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id: ${id}`);
  }
});

test("samples: categories valid and every category populated", () => {
  for (const s of allSamples) {
    assert.ok(sampleCategories.includes(s.category), `${s.id}: bad category ${s.category}`);
  }
  for (const cat of sampleCategories) {
    assert.ok(
      allSamples.some((s) => s.category === cat),
      `category ${cat} has no samples`
    );
  }
});

test("samples: required fields substantial", () => {
  for (const s of allSamples) {
    assert.ok(s.title.length >= 8, `${s.id}: short title`);
    assert.ok(s.description.length >= 60, `${s.id}: short description`);
    assert.ok(s.notes.length >= 60, `${s.id}: short notes`);
    assert.ok(s.tags.length >= 3, `${s.id}: too few tags`);
    assert.ok(s.code.length >= 1500, `${s.id}: code suspiciously short (${s.code.length} chars)`);
    assert.match(s.minFlutter, /^\d+\.\d+$/, `${s.id}: bad minFlutter ${s.minFlutter}`);
    assert.ok(["advanced", "expert"].includes(s.difficulty), `${s.id}: bad difficulty`);
  }
});

test("samples: code looks like complete Dart and avoids deprecated APIs", () => {
  for (const s of allSamples) {
    assert.ok(
      /void main\(\)|Future<void> main\(\)/.test(s.code),
      `${s.id}: no main() entry point`
    );
    const opens = (s.code.match(/\{/g) ?? []).length;
    const closes = (s.code.match(/\}/g) ?? []).length;
    assert.equal(opens, closes, `${s.id}: unbalanced braces (${opens} vs ${closes})`);
    for (const token of DEPRECATED_API_TOKENS) {
      assert.ok(!s.code.includes(token), `${s.id}: uses deprecated API ${token}`);
    }
  }
});

test("samples: search returns relevant hits", () => {
  const cases = [
    ["custom painter chart", "rendering"],
    ["spring physics animation", "animation"],
    ["isolate background parsing", "async"],
    ["golden test", "testing"],
    ["bottom navigation router", "navigation"],
  ];
  for (const [query, expectCat] of cases) {
    const hits = findSamples(query, 5);
    assert.ok(hits.length > 0, `no hits for "${query}"`);
    assert.ok(
      hits.some((h) => h.category === expectCat),
      `"${query}" found no ${expectCat} sample (got ${hits.map((h) => h.id).join(", ")})`
    );
  }
});

test("samples: getSample round-trips every id", () => {
  for (const s of allSamples) {
    assert.equal(getSample(s.id)?.id, s.id);
  }
});

test("knowledge: entries well-formed", () => {
  assert.ok(knowledgeEntries.length >= 8, `expected >=8 entries, got ${knowledgeEntries.length}`);
  const ids = knowledgeEntries.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate knowledge ids");
  for (const e of knowledgeEntries) {
    assert.match(e.asOf, /^\d{4}-\d{2}$/, `${e.id}: bad asOf`);
    assert.ok(e.content.length >= 1000, `${e.id}: content too short`);
    assert.ok(e.summary.length >= 40, `${e.id}: summary too short`);
  }
});

test("knowledge: search finds core topics", () => {
  for (const q of ["project structure", "state management", "flavors", "lint"]) {
    assert.ok(findKnowledge(q, 3).length > 0, `no knowledge hit for "${q}"`);
  }
});

test("knowledge: no cancelled-macros advocacy", () => {
  for (const e of knowledgeEntries) {
    // Macros were cancelled Jan 2025; the KB must not recommend waiting for them.
    assert.ok(
      !/macros? (will|are coming|land)/i.test(e.content),
      `${e.id}: recommends waiting for macros`
    );
  }
});
