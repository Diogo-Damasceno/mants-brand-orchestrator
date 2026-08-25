import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { eq } from 'drizzle-orm';
import { json, errorResponse, HttpError } from '@/lib/server/http';
import { registerSchema } from '@mants/validation';
import { hashPassword, signSession } from '@mants/auth';
import { getServerConfig } from '@mants/config';
import { createOrganizationWithOwner, slugAvailable } from '@/lib/server/repositories';

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

    const userId = randomUUID();

    // Slug único com sufixo seguro em caso de colisão.
    let slug = body.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    if (!slug) slug = 'org';
    slug = await slugAvailable(slug);

    const orgId = await createOrganizationWithOwner({
      name: body.organizationName,
      slug,
      ownerId: userId,
      ownerEmail: email,
      ownerName: body.name,
    });

    await db.insert(schema.users).values({
      id: userId,
      email,
      name: body.name,
      passwordHash: hashPassword(body.password),
    });

    const token = signSession(
      { sub: userId, org: orgId, roles: ['organization_owner'] },
      getServerConfig().authSecret,
      getServerConfig().sessionTtlSeconds,
    );

    return json({ token, userId, organizationId: orgId }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
