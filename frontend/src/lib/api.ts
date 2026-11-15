import { ApiRequestError } from "./errors";
import { secureRequest } from "./secureChannel";

export { ApiRequestError };
export {
  getApiBaseUrl,
  setApiBaseUrl,
  getSessionToken,
  setSessionToken,
  getGuestToken,
  rotateGuestToken,
  isRouteObfuscationEnabled,
  setRouteObfuscation,
} from "./channelConfig";

/** All API traffic is encrypted end-to-end by the Laorvia secure channel. */
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { idempotencyKey?: string; obfuscate?: boolean },
): Promise<T> {
  return secureRequest<T>(method, path, body, options);
}

export const api = {
  get: <T>(path: string, options?: { obfuscate?: boolean }) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: { idempotencyKey?: string; obfuscate?: boolean }) =>
    request<T>("POST", path, body, options),
  put: <T>(path: string, body?: unknown, options?: { obfuscate?: boolean }) =>
    request<T>("PUT", path, body, options),
  delete: <T>(path: string, options?: { obfuscate?: boolean }) => request<T>("DELETE", path, undefined, options),
};
