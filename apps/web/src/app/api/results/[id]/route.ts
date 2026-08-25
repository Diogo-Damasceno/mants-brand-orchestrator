import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const id = req.nextUrl.pathname.split('/')[3]!;
    if (!id) throw new HttpError(400, 'ID ausente.');
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.results)
      .where(and(eq(schema.results.id, id), eq(schema.results.organizationId, ctx.organizationId)));
    if (!row) throw new HttpError(404, 'Resultado não encontrado.');
    const versions = await db.select().from(schema.resultVersions).where(eq(schema.resultVersions.resultId, id));
    const comments = await db
      .select()
      .from(schema.comments)
      .where(and(eq(schema.comments.targetType, 'result'), eq(schema.comments.targetId, id)));
    const approvals = await db.select().from(schema.approvals).where(eq(schema.approvals.resultId, id));
    return json({ result: row, versions, comments, approvals });
  } catch (e) {
    return errorResponse(e);
  }
}
