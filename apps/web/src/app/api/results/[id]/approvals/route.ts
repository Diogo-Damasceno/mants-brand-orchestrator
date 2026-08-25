import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { approvalDecisionSchema } from '@mants/validation';
import { CONTENT_MANAGER_ROLES } from '@/lib/server/authz';

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (!ctx.roles.some((r) => CONTENT_MANAGER_ROLES.includes(r))) {
      throw new HttpError(403, 'Sem permissão.');
    }
    const body = approvalDecisionSchema.parse(await req.json());
    const db = getDb();
    const [result] = await db
      .select()
      .from(schema.results)
      .where(and(eq(schema.results.id, body.resultId), eq(schema.results.organizationId, ctx.organizationId)));
    if (!result) throw new HttpError(404, 'Resultado não encontrado.');
    const id = randomUUID();
    await db.insert(schema.approvals).values({
      id,
      organizationId: ctx.organizationId,
      resultId: body.resultId,
      decision: body.decision,
      decidedBy: ctx.userId,
      comment: body.comment,
    });
    await db
      .update(schema.results)
      .set({ status: body.decision === 'approved' ? 'approved' : 'changes_requested' })
      .where(eq(schema.results.id, body.resultId));
    return json({ id, decision: body.decision }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
