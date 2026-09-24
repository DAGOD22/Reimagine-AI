import { z } from "zod";

const text = z.string().min(1);
const textList = z.array(text);

export const spaceAnalysisSchema = z.object({
  currentSpace: z.object({
    roomType: text,
    summary: text,
    confidence: z.enum(["low", "medium", "high"]),
  }),
  architecture: textList,
  existingElements: z.array(z.object({ name: text, description: text, condition: z.string().optional() })),
  materials: z.array(z.object({ element: text, material: text, color: z.string().optional() })),
  lighting: textList,
  spatialRelationships: textList,
  opportunities: textList,
  constraints: textList,
  preserve: textList,
  replaceCandidates: textList,
  uncertaintyNotes: textList,
});

export const renovationPlanSchema = z.object({
  designConcept: text,
  style: textList,
  colorPalette: z.array(z.object({ name: text, hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/), usage: text })),
  materials: z.array(z.object({ material: text, application: text, rationale: text })),
  flooring: textList,
  walls: textList,
  ceiling: textList,
  lighting: textList,
  furniture: textList,
  layoutRecommendations: textList,
  architecturalConsiderations: textList,
  preserve: textList,
  replace: textList,
  renovationSteps: z.array(
    z.object({ order: z.number(), title: text, detail: text, trade: z.string().optional() }),
  ),
  estimatedDifficulty: z.enum(["low", "medium", "high"]),
  potentialIssues: textList,
  productCategories: z.array(z.object({ category: text, searchTerms: text, whyItMatches: text })),
  imageGenerationInstructions: text,
  assumptions: textList,
});

export const budgetSchema = z.object({
  currency: text,
  targetBudget: z.number().nonnegative(),
  estimatedLow: z.number().nonnegative(),
  estimatedHigh: z.number().nonnegative(),
  categories: z.array(z.object({ name: text, low: z.number().nonnegative(), high: z.number().nonnegative(), notes: text })),
  contingencyPercent: z.number().min(0).max(100),
  contingencyLow: z.number().nonnegative(),
  contingencyHigh: z.number().nonnegative(),
  assumptions: textList,
  exclusions: textList,
  disclaimer: text,
});

export const productsSchema = z.object({
  products: z.array(
    z.object({
      category: text,
      description: text,
      searchTerms: text,
      whyItMatches: text,
      specifications: textList,
    }),
  ),
});

export const colorSchema = z.object({
  approximateName: text,
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  rgb: z.object({ r: z.number().min(0).max(255), g: z.number().min(0).max(255), b: z.number().min(0).max(255) }),
  confidence: z.enum(["low", "medium", "high"]),
  observedOn: text,
  lightingCaveat: text,
  searchTerms: textList,
});

export const generationPromptSchema = z.object({
  prompt: z.string().min(40),
  preserve: textList,
  change: textList,
  negativeInstructions: textList,
});

export type AiSchema = z.ZodTypeAny;
