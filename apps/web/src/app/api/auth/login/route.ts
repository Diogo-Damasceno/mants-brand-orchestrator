import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq } from 'drizzle-orm';
import { json, errorResponse, HttpError } from '@/lib/server/http';
import { loginSchema } from '@mants/validation';
import { verifyPassword, signSession } from '@mants/auth';
import { getServerConfig } from '@mants/config';
import { setSessionCookie } from '@/lib/server/session';

export async function POST(req: NextRequest) {
  try {
    const body = loginSchema.parse(await req.json());
    const db = getDb();
    const email = body.email.toLowerCase();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    // Resposta neutra: não revela se o e-mail existe.
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw new HttpError(401, 'Credenciais inválidas.');
    }
    const [member] = await db
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.userId, user.id))
      .limit(1);
    const orgId = member?.organizationId ?? user.id;
    const token = signSession(
      { sub: user.id, org: orgId, roles: member ? [member.role] : ['viewer'] },
      getServerConfig().authSecret,
      getServerConfig().sessionTtlSeconds,
    );
    const res = json({ token, userId: user.id, organizationId: orgId });
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
