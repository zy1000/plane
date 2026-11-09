import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Exercise the production evaluator without loading the React app or alias resolver.
const source = readFileSync(new URL("../core/utils/field-linkage.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { evaluateFieldLinkage, dependencyClosure } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const field = (id, linkage = {}) => ({
  id,
  name: id,
  field_type: "select",
  options: { choices: ["1", "2", "7", "8", "9"] },
  linkage,
});
const values = (data) => Object.entries(data).map(([extra_field_id, value]) => ({ extra_field_id, value }));
const cascade = { options: { field_id: "a", mappings: { 1: ["7", "8"], 2: ["9"] } } };

test("changing the source clears invalid values through an unordered dependency chain", () => {
  const fields = [field("c", { visibility: { field_id: "b", values: ["7"] } }), field("b", cascade), field("a")];
  const original = values({ a: "2", b: "7", c: "8" });
  const result = evaluateFieldLinkage(fields, original);
  assert.deepEqual(
    result.fields.map((f) => f.id),
    ["b", "a"]
  );
  assert.deepEqual(result.values, values({ a: "2", b: null, c: null }));
  assert.equal(original[1].value, "7");
  assert.deepEqual(result.fields[0].options.choices, [{ key: "9", label: "9" }]);
});

test("multi-select sources union allowed options and preserve only valid selections", () => {
  const result = evaluateFieldLinkage(
    [field("a"), field("b", cascade)],
    values({ a: ["1", "2"], b: ["7", "invalid", "9"] })
  );
  assert.deepEqual(result.values[1].value, ["7", "9"]);
});

test("missing or inactive sources offer no cascade options and hide conditional required fields", () => {
  const b = field("b", cascade);
  const c = field("c", { visibility: { field_id: "a", values: ["1"] } });
  for (const fields of [
    [b, c],
    [{ ...field("a"), is_active: false }, b, c],
  ]) {
    const result = evaluateFieldLinkage(fields, values({ a: "1", b: "7" }));
    assert.deepEqual(
      result.fields.map((f) => f.id),
      ["b"]
    );
    assert.deepEqual(result.fields[0].options.choices, []);
    assert.equal(result.values[1].value, null);
  }
});

test("binding expands transitive dependencies once in prerequisite order", () => {
  const fields = [field("a"), field("b", cascade), field("c", { visibility: { field_id: "b", values: ["7"] } })];
  assert.deepEqual(
    dependencyClosure(fields, ["c", "b"]).map((f) => f.id),
    ["a", "b", "c"]
  );
});
