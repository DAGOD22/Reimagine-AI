export class StructuredResponseError extends Error {
  constructor() {
    super("The model response was not valid JSON.");
    this.name = "StructuredResponseError";
  }
}

export function parseStructuredJson(raw: string): unknown {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const first = unfenced.indexOf("{");
    const last = unfenced.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(unfenced.slice(first, last + 1));
      } catch {
        // Converted to a typed structured-response error below.
      }
    }
    throw new StructuredResponseError();
  }
}
