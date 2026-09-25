export type RoomType =
  | "bedroom"
  | "living_room"
  | "kitchen"
  | "bathroom"
  | "dining_room"
  | "office"
  | "garage"
  | "basement"
  | "hallway"
  | "apartment"
  | "house_exterior"
  | "backyard"
  | "garden"
  | "balcony"
  | "patio"
  | "other";

export type ImageKind = "original" | "reference" | "generated";

export interface UserSafe {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  isGuest: boolean;
}

export interface SpaceAnalysis {
  currentSpace: {
    roomType: string;
    summary: string;
    confidence: "low" | "medium" | "high";
  };
  architecture: string[];
  existingElements: Array<{ name: string; description: string; condition?: string }>;
  materials: Array<{ element: string; material: string; color?: string }>;
  lighting: string[];
  spatialRelationships: string[];
  opportunities: string[];
  constraints: string[];
  preserve: string[];
  replaceCandidates: string[];
  uncertaintyNotes: string[];
}

export interface RenovationPlan {
  designConcept: string;
  style: string[];
  colorPalette: Array<{ name: string; hex: string; usage: string }>;
  materials: Array<{ material: string; application: string; rationale: string }>;
  flooring: string[];
  walls: string[];
  ceiling: string[];
  lighting: string[];
  furniture: string[];
  layoutRecommendations: string[];
  architecturalConsiderations: string[];
  preserve: string[];
  replace: string[];
  renovationSteps: Array<{ order: number; title: string; detail: string; trade?: string }>;
  estimatedDifficulty: "low" | "medium" | "high";
  potentialIssues: string[];
  productCategories: Array<{ category: string; searchTerms: string; whyItMatches: string }>;
  imageGenerationInstructions: string;
  assumptions: string[];
}

export interface BudgetPlan {
  currency: string;
  targetBudget: number;
  estimatedLow: number;
  estimatedHigh: number;
  categories: Array<{
    name: string;
    low: number;
    high: number;
    notes: string;
  }>;
  contingencyPercent: number;
  contingencyLow: number;
  contingencyHigh: number;
  assumptions: string[];
  exclusions: string[];
  disclaimer: string;
}

export interface ColorEstimate {
  approximateName: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
  confidence: "low" | "medium" | "high";
  observedOn: string;
  lightingCaveat: string;
  searchTerms: string[];
}

export interface ProductCategory {
  category: string;
  description: string;
  searchTerms: string;
  whyItMatches: string;
  specifications: string[];
}

export interface AiStatus {
  id?: string;
  task: string;
  status: "idle" | "running" | "success" | "error";
  provider: string;
  model?: string;
  code?: string;
  message?: string;
  httpStatus?: number;
  latencyMs?: number;
  imageCount?: number;
  requestId?: string;
  timestamp: string;
  configured?: boolean;
}

export interface ProjectImage {
  id: string;
  kind: ImageKind;
  url: string;
  thumbnailUrl: string;
  filename: string;
  width: number;
  height: number;
  sizeBytes: number;
  versionId?: string | null;
  createdAt: string;
}

export interface ProjectFile {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  hasExtractedText: boolean;
  downloadUrl: string;
  createdAt: string;
}

export interface Version {
  id: string;
  number: number;
  imageId: string;
  imageUrl: string;
  thumbnailUrl: string;
  parentId?: string | null;
  prompt: string;
  provider: string;
  createdAt: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  roomType: RoomType;
  status: string;
  instructions: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  images: ProjectImage[];
  files: ProjectFile[];
  analysis: SpaceAnalysis | null;
  plan: RenovationPlan | null;
  budget: BudgetPlan | null;
  products: ProductCategory[] | null;
  versions: Version[];
  aiStatuses: AiStatus[];
}
