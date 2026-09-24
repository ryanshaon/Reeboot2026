import { event, handle, json, body, requireOrigin, setSession } from '@/lib/api.js';
import { allowedEmailDomains } from '@/lib/validation.js';

export const runtime = 'nodejs';
export const POST = handle(async (request) => {
  requireOrigin(request);
  const enrolled = await event.enroll(await body(request), allowedEmailDomains());
  return setSession(json(enrolled, 201), 'member', enrolled.members[0].id, enrolled.members[0].sessionVersion);
});
