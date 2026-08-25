import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq, and } from 'drizzle-orm';
import { authenticate, json, errorResponse } from '@/lib/server/http';

/** Registra uso de um prompt gerado (auditoria). Não expira nada sensível. */
export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  try {
    const context = ctx2 as { params: { id: string } };
    const ctx = await authenticate(req);
    const id = context.params.id;
    const db = getDb();
    const [prompt] = await db
      .select()
      .from(schema.generatedPrompts)
      .where(and(eq(schema.generatedPrompts.id, id), eq(schema.generatedPrompts.organizationId, ctx.organizationId)));
    if (!prompt) return json({ ok: false }, 404);
    await db.insert(schema.auditLogs).values({
      id: randomUUID(),
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      action: 'prompt_used',
      entity: 'generated_prompt',
      entityId: id,
    });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
