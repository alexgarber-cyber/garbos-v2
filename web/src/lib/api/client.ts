import createClient from "openapi-fetch";

import type { paths } from "./schema";

/**
 * Resolve the API base URL.
 *
 * - Browser: the host-published port (the browser cannot resolve the compose
 *   service name `api`).
 * - Server (RSC / route handlers / middleware): container-to-container DNS.
 */
export function apiBaseUrl(): string {
  const isServer = typeof window === "undefined";
  if (isServer) {
    return process.env.API_BASE_URL_INTERNAL ?? "http://api:8000";
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
}

/**
 * Typed fetch client. `credentials: "include"` so the httpOnly session cookie
 * is sent/received on browser requests.
 */
export function makeClient() {
  return createClient<paths>({ baseUrl: apiBaseUrl(), credentials: "include" });
}

export const api = makeClient();
