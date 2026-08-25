import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq, and } from 'drizzle-orm';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { promptEditSchema } from '@mants/validation';
import { CONTENT_MANAGER_ROLES } from '@/lib/server/authz';

function promptId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/');
  return parts[parts.length - 1]!;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.generatedPrompts)
      .where(
        and(
          eq(schema.generatedPrompts.id, promptId(req)),
          eq(schema.generatedPrompts.organizationId, ctx.organizationId),
        ),
      );
    if (!row) throw new HttpError(404, 'Prompt não encontrado.');
    return json({ prompt: row });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (!ctx.roles.some((r) => CONTENT_MANAGER_ROLES.includes(r))) {
      throw new HttpError(403, 'Sem permissão.');
    }
    const body = promptEditSchema.parse(await req.json());
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.generatedPrompts)
      .where(
        and(
          eq(schema.generatedPrompts.id, body.promptId),
          eq(schema.generatedPrompts.organizationId, ctx.organizationId),
        ),
      );
    if (!row) throw new HttpError(404, 'Prompt não encontrado.');
    await db
      .update(schema.generatedPrompts)
      .set({ editedText: body.editedText, editedBy: ctx.userId, editedAt: new Date() })
      .where(eq(schema.generatedPrompts.id, body.promptId));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
