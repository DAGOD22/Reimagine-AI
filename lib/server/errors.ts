import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ErrorCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "not_found"
  | "missing_api_key"
  | "provider_authentication"
  | "rate_limit"
  | "invalid_model"
  | "invalid_image"
  | "network"
  | "malformed_response"
  | "image_generation"
  | "database"
  | "unknown";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public category: ErrorCategory = "unknown",
    public recoverable = false,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    return new ApiError(400, "INVALID_REQUEST", "Please check the highlighted information and try again.", "validation", true, {
      issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  if (error instanceof SyntaxError) {
    return new ApiError(400, "INVALID_JSON", "The request contained invalid JSON.", "validation", true);
  }
  return new ApiError(500, "INTERNAL_ERROR", "Something went wrong while processing the request.", "unknown", true);
}

export function errorResponse(error: unknown) {
  const apiError = asApiError(error);
  return NextResponse.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        category: apiError.category,
        recoverable: apiError.recoverable,
        details: apiError.details,
      },
    },
    { status: apiError.status },
  );
}

export async function withApiErrors(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return errorResponse(error);
  }
}
