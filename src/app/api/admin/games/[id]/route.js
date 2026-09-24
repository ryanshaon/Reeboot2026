import { event, handle, json, body, requireOrigin, requireAdmin } from '@/lib/api.js';

export const runtime = 'nodejs';
export const PATCH = handle(async (request, context) => {
  requireOrigin(request);
  requireAdmin(request);
  const { id } = await context.params;
  return json({ game: await event.updateGame(id, await body(request)) });
});
