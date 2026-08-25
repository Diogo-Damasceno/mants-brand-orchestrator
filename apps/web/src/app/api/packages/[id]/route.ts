import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const id = req.nextUrl.pathname.split('/')[3]!;
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.creativePackages)
      .where(and(eq(schema.creativePackages.id, id), eq(schema.creativePackages.organizationId, ctx.organizationId)));
    if (!row) throw new HttpError(404, 'Pacote não encontrado.');
    return json({ package: row });
  } catch (e) {
    return errorResponse(e);
  }
}
