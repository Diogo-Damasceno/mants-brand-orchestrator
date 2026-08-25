import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';

function resultId(req: NextRequest): string {
  // /api/results/[id]/comments
  return req.nextUrl.pathname.split('/')[3]!;
}

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);
    const db = getDb();
    const comments = await db
      .select()
      .from(schema.comments)
      .where(and(eq(schema.comments.targetType, 'result'), eq(schema.comments.targetId, resultId(req))))
      .orderBy(desc(schema.comments.createdAt));
    return json({ comments });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const body = (await req.json()) as { body?: string };
    if (!body.body) throw new HttpError(400, 'Comentário ausente.');
    const db = getDb();
    // Confirma que o resultado pertence à organização.
    const [result] = await db
      .select()
      .from(schema.results)
      .where(and(eq(schema.results.id, resultId(req)), eq(schema.results.organizationId, ctx.organizationId)));
    if (!result) throw new HttpError(404, 'Resultado não encontrado.');
    const id = randomUUID();
    await db.insert(schema.comments).values({
      id,
      organizationId: ctx.organizationId,
      targetType: 'result',
      targetId: resultId(req),
      authorId: ctx.userId,
      body: body.body,
    });
    return json({ id }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
