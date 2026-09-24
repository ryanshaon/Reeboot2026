import { event, handle, json, requireOrigin, requireAdmin } from '@/lib/api.js';

export const runtime = 'nodejs';
export const POST = handle(async (request, context) => {
  requireOrigin(request);
  requireAdmin(request);
  const { id } = await context.params;
  return json(await event.resetCode(id));
});
