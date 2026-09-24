import { event, handle, json, body, requireOrigin, requireAdmin } from '@/lib/api.js';

export const runtime = 'nodejs';
const save = handle(async (request) => {
  requireOrigin(request);
  requireAdmin(request);
  return json({ attempt: await event.addScore(await body(request)) }, 201);
});
export const POST = save;
export const PUT = save;
