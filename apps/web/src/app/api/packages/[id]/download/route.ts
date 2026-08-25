import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and } from 'drizzle-orm';
import { authenticate, errorResponse, HttpError } from '@/lib/server/http';
import { createStorage } from '@/lib/server/storage';

/** Download privado de pacote por ID (filtrado por organização). */
export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const id = req.nextUrl.pathname.split('/')[3]!;
    const db = getDb();
    const [pkg] = await db
      .select()
      .from(schema.creativePackages)
      .where(and(eq(schema.creativePackages.id, id), eq(schema.creativePackages.organizationId, ctx.organizationId)));
    if (!pkg) throw new HttpError(404, 'Pacote não encontrado.');
    const storage = createStorage();
    const buf = await storage.get(pkg.storageKey);
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${pkg.fileName.replace(/"/g, '')}"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
