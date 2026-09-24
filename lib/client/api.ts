export class ClientApiError extends Error {
  constructor(
    message: string,
    public code = "REQUEST_FAILED",
    public category = "unknown",
    public status = 500,
    public recoverable = true,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ClientApiError(
      "Hearthform could not reach the server. Check your connection and try again.",
      "NETWORK_FAILURE",
      "network",
      0,
      true,
    );
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const error = payload?.error;
    throw new ClientApiError(
      error?.message || `The request failed with status ${response.status}.`,
      error?.code,
      error?.category,
      response.status,
      error?.recoverable ?? response.status >= 500,
      error?.details,
    );
  }
  return payload as T;
}
