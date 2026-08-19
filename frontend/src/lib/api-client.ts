const TOKEN_KEY = "payment-saas-access-token";
const TOKEN_EXPIRY_KEY = "payment-saas-token-expiry";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getStoredToken() {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  const expiresAt = Number(window.localStorage.getItem(TOKEN_EXPIRY_KEY));
  if (!token || !expiresAt || Date.now() >= expiresAt) {
    clearStoredToken();
    return null;
  }
  return token;
}

export function storeToken(token: string, expiresIn: number) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(
    TOKEN_EXPIRY_KEY,
    String(Date.now() + expiresIn * 1000),
  );
}

export function clearStoredToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  authenticated?: boolean;
};

export async function apiRequest<T>(
  path: string,
  { body, authenticated = true, headers, ...options }: ApiRequestOptions = {},
) {
  const requestHeaders = new Headers(headers);
  if (body !== undefined) requestHeaders.set("Content-Type", "application/json");
  if (authenticated) {
    const token = getStoredToken();
    if (!token) throw new ApiError("Your session has expired", 401);
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`/api/backend${path}`, {
    ...options,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String(payload.message)
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}
