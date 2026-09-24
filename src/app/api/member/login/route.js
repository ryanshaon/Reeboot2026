import { event, handle, json, body, requireOrigin, setSession, memberLoginThrottle, memberGlobalLoginThrottle, throttleError } from '@/lib/api.js';
import { loginKeys } from '@/lib/login-throttle.js';
import { normalizeEmail } from '@/lib/validation.js';

export const runtime = 'nodejs';
export const POST = handle(async (request) => {
  requireOrigin(request);
  const input = await body(request);
  const [emailKey, globalKey] = loginKeys(request, 'member', normalizeEmail(input?.email));
  const retryAfter = Math.max(...await Promise.all([
    memberLoginThrottle.attempt(emailKey),
    memberGlobalLoginThrottle.attempt(globalKey),
  ]));
  if (retryAfter) throw throttleError(retryAfter);
  const member = await event.memberLogin(input);
  await Promise.all([
    memberLoginThrottle.success(emailKey),
    memberGlobalLoginThrottle.success(globalKey),
  ]);
  return setSession(json({ member }), 'member', member.id, member.sessionVersion);
});
