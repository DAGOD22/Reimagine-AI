import test from "node:test";
import assert from "node:assert/strict";
import { parseStructuredJson, StructuredResponseError } from "@/lib/ai/parse";
import { colorSchema, generationPromptSchema, spaceAnalysisSchema } from "@/lib/server/ai-schemas";

test("structured parser accepts clean and fenced JSON", () => {
  assert.deepEqual(parseStructuredJson('{"ok":true}'), { ok: true });
  assert.deepEqual(parseStructuredJson('```json\n{"ok":true}\n```'), { ok: true });
});

test("structured parser extracts a JSON object from provider prose", () => {
  assert.deepEqual(parseStructuredJson('Result follows: {"value":42} end.'), { value: 42 });
});

test("structured parser rejects malformed provider output", () => {
  assert.throws(() => parseStructuredJson("not json"), StructuredResponseError);
});

test("space analysis schema rejects ungrounded shape changes", () => {
  const valid = {
    currentSpace: { roomType: "living room", summary: "A visible room.", confidence: "medium" },
    architecture: ["Two windows"],
    existingElements: [{ name: "Sofa", description: "Three-seat sofa" }],
    materials: [{ element: "floor", material: "wood" }],
    lighting: ["daylight"],
    spatialRelationships: ["sofa faces windows"],
    opportunities: ["improve light"],
    constraints: ["dimensions unknown"],
    preserve: ["windows"],
    replaceCandidates: ["sofa"],
    uncertaintyNotes: ["depth is not measurable"],
  };
  assert.equal(spaceAnalysisSchema.safeParse(valid).success, true);
  assert.equal(spaceAnalysisSchema.safeParse({ ...valid, currentSpace: { ...valid.currentSpace, confidence: "certain" } }).success, false);
});

test("color and image prompt schemas enforce useful output", () => {
  assert.equal(colorSchema.safeParse({ approximateName: "Warm white", hex: "#F3EFE4", rgb: { r: 243, g: 239, b: 228 }, confidence: "medium", observedOn: "far wall", lightingCaveat: "Daylight is cool.", searchTerms: ["warm white paint swatch"] }).success, true);
  assert.equal(colorSchema.safeParse({ approximateName: "White", hex: "white", rgb: { r: 999, g: 0, b: 0 }, confidence: "exact", observedOn: "wall", lightingCaveat: "none", searchTerms: [] }).success, false);
  assert.equal(generationPromptSchema.safeParse({ prompt: "Edit the supplied photograph while preserving every opening and camera perspective.", preserve: ["windows"], change: ["floor"], negativeInstructions: ["warped geometry"] }).success, true);
});
