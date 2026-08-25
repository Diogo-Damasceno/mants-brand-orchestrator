'use client';

import { useEffect, useState } from 'react';

/**
 * Cliente HTTP do site.
 * Autenticação via cookie HttpOnly (mants_session) — nunca por token no localStorage.
 * O cookie é enviado automaticamente com credentials: 'include'.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    const err = new Error('Sessão expirada. Faça login novamente.') as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
}

export function useDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' });
}

/**
 * @deprecated Autenticação agora é por cookie HttpOnly. Mantido apenas para compatibilidade
 * de páginas legadas; não armazena token no localStorage.
 */
export function useToken(): string | null {
  return typeof document !== 'undefined' ? 'cookie' : null;
}

/**
 * Hook de leitura de recurso autenticado via cookie (credentials: 'include').
 * Substitui o uso de token em localStorage.
 */
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiGet<T>(path)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false));
  }, [path]);
  return { data, error, loading };
}

/**
 * Hook de sessão atual do site (lê /api/auth/me via cookie).
 */
export interface Me {
  userId: string;
  organizationId: string;
  roles: string[];
  organizations?: { organizationId: string; role: string }[];
}
export function useAuth(): { me: Me | null; error: string; loading: boolean } {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiGet<Me>('/api/auth/me')
      .then(setMe)
      .catch((e) => setError(e instanceof Error ? e.message : 'Não autenticado'))
      .finally(() => setLoading(false));
  }, []);
  return { me, error, loading };
}
