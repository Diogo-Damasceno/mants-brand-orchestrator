import { NextRequest } from 'next/server';
import { json, errorResponse } from '@/lib/server/http';
import { clearSessionCookie } from '@/lib/server/session';

export async function POST(_req: NextRequest) {
  try {
    const res = json({ ok: true });
    clearSessionCookie(res);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
