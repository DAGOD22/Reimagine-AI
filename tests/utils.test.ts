import test from "node:test";
import assert from "node:assert/strict";
import { clamp, formatBytes, safeJsonParse, titleCase } from "@/lib/utils";

test("display utilities format project values", () => {
  assert.equal(titleCase("house_exterior"), "House Exterior");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(clamp(2, 0, 1), 1);
});

test("safeJsonParse never crashes project serialization", () => {
  assert.deepEqual(safeJsonParse('{"a":1}', {}), { a: 1 });
  assert.deepEqual(safeJsonParse("broken", { fallback: true }), { fallback: true });
});
