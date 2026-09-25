import type { RoomType } from "@/lib/types";

export const BRAND = {
  name: "Hearthform",
  tagline: "See your space differently.",
  description: "A considered renovation studio, powered by visual intelligence.",
} as const;

export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";

export const ROOM_TYPES: Array<{ value: RoomType; label: string }> = [
  { value: "bedroom", label: "Bedroom" },
  { value: "living_room", label: "Living room" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "dining_room", label: "Dining room" },
  { value: "office", label: "Office" },
  { value: "garage", label: "Garage" },
  { value: "basement", label: "Basement" },
  { value: "hallway", label: "Hallway" },
  { value: "apartment", label: "Apartment" },
  { value: "house_exterior", label: "House exterior" },
  { value: "backyard", label: "Backyard" },
  { value: "garden", label: "Garden" },
  { value: "balcony", label: "Balcony" },
  { value: "patio", label: "Patio" },
  { value: "other", label: "Other space" },
];

export const STYLE_SUGGESTIONS = [
  "Modern minimalist",
  "Scandinavian",
  "Quiet luxury",
  "Japandi",
  "Industrial",
  "Traditional",
  "Contemporary",
  "Coastal",
  "Mid-century",
  "Rustic",
] as const;

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "INR"] as const;
