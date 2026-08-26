import { NextResponse } from 'next/server';

/** Liveness: o processo Next.js está respondendo. */
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
