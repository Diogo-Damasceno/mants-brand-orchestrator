import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '@mants/database';
import { authenticate, json, errorResponse, HttpError } from '@/lib/server/http';
import { createStorage, validateUpload, sha256Hex, sanitizeSvg } from '@/lib/server/storage';

export async function POST_upload(req: NextRequest) {
  try {
    const ctx = authenticate(req);
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'Arquivo ausente.');
    const buffer = Buffer.from(await file.arrayBuffer());
    validateUpload(file.type, buffer.byteLength);
    let content = buffer;
    if (file.type === 'image/svg+xml') {
      content = Buffer.from(sanitizeSvg(buffer.toString('utf8')), 'utf8');
    }
    const key = `assets/${ctx.organizationId}/${randomUUID()}-${file.name}`;
    const storage = createStorage();
    const { size } = await storage.put({ key, buffer: content, contentType: file.type });
    const db = getDb();
    const id = randomUUID();
    await db.insert(schema.brandAssets).values({
      id,
      organizationId: ctx.organizationId,
      storageKey: key,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: size,
      status: 'pending',
      assetHash: sha256Hex(content),
      version: 1,
    });
    return json({ id, key, size }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
