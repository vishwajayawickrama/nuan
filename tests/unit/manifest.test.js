const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

test("does not register static content scripts", () => {
  assert.equal(manifest.content_scripts, undefined);
});

test("keeps only permissions needed for optimized runtime behavior", () => {
  assert.deepEqual(manifest.permissions, ["alarms", "idle", "scripting", "storage", "tabs"]);
});
