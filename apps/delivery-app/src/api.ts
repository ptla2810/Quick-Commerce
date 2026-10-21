import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

const TOKEN_KEY = 'padosi.session';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { fields?: Record<string, string>; issues?: { code: string; message: string }[] }) {
    super(message);
  }
}

let token: string | null = null;
export async function loadToken() {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}
export async function setToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Calls the API with the stored bearer token. Mobile sessions never use cookies. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw new ApiError(0, 'NETWORK', `Cannot reach the server at ${API_URL}. Check your connection.`);
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'HTTP', json?.error?.message ?? `Request failed (${res.status})`, json?.error?.details);
  return json as T;
}

export const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
