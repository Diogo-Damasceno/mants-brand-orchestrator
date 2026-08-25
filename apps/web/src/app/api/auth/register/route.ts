import { NextRequest } from 'next/server';
import { getDb, schema } from '@mants/database';
import { eq } from 'drizzle-orm';
import { json, errorResponse, HttpError } from '@/lib/server/http';
import { registerSchema } from '@mants/validation';
import { signSession } from '@mants/auth';
import { getServerConfig } from '@mants/config';
import { registerUserWithOrg, slugAvailable } from '@/lib/server/repositories';
import { setSessionCookie } from '@/lib/server/session';

export async function POST(req: NextRequest) {
  try {
    const body = registerSchema.parse(await req.json());
    const db = getDb();
    const email = body.email.toLowerCase();

    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    if (existing) throw new HttpError(409, 'E-mail já cadastrado.');

    // Slug único com sufixo seguro em caso de colisão (a constraint do banco também protege).
    let slug = body.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    if (!slug) slug = 'org';
    slug = await slugAvailable(slug);

    // Cadastro completo em UMA transação (usuário + org + membro + assinatura + contadores + auditoria).
    const { userId, orgId } = await registerUserWithOrg({
      name: body.name,
      email,
      password: body.password,
      organizationName: body.organizationName,
      slug,
    });

    const token = signSession(
      { sub: userId, org: orgId, roles: ['organization_owner'] },
      getServerConfig().authSecret,
      getServerConfig().sessionTtlSeconds,
    );

    const res = json({ userId, organizationId: orgId }, 201);
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
