'use client';
import { useEffect, useState } from 'react';

export function useToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(localStorage.getItem('mants_token'));
  }, []);
  return token;
}

export async function apiGet<T>(path: string, token: string | null): Promise<T> {
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json() as Promise<T>;
}

export function useResource<T>(path: string) {
  const token = useToken();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!token) {
      setError('Não autenticado.');
      setLoading(false);
      return;
    }
    apiGet<T>(path, token)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false));
  }, [path, token]);
  return { data, error, loading };
}
