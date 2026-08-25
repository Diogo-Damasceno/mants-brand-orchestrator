import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and, isNull } from 'drizzle-orm';
import { authenticate, errorResponse, HttpError } from '@/lib/server/http';
import { createStorage } from '@/lib/server/storage';

/** Download privado de ativo por ID (filtrado por organização). */
export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const id = req.nextUrl.pathname.split('/')[3]!;
    const db = getDb();
    const [asset] = await db
      .select()
      .from(schema.brandAssets)
      .where(
        and(
          eq(schema.brandAssets.id, id),
          eq(schema.brandAssets.organizationId, ctx.organizationId),
          isNull(schema.brandAssets.deletedAt),
        ),
      );
    if (!asset) throw new HttpError(404, 'Ativo não encontrado.');
    const storage = createStorage();
    const buf = await storage.get(asset.storageKey);
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': asset.mimeType,
        'Content-Disposition': `attachment; filename="${asset.originalName.replace(/"/g, '')}"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
