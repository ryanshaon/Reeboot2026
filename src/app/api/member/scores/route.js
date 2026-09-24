import { event, handle, json, body, requireOrigin, requireMember, scoreCodeThrottle, throttleError } from '@/lib/api.js';
import { scoreCodeKey } from '@/lib/score-code.js';

export const runtime = 'nodejs';
export const POST = handle(async (request) => {
  requireOrigin(request);
  const member = await requireMember(request);
  if (!member) throw Object.assign(new Error('Member sign-in required.'), { status: 401 });
  const key = scoreCodeKey();
  const throttleKey = `score-code:${member.id}`;
  const retryAfter = await scoreCodeThrottle.attempt(throttleKey);
  if (retryAfter) throw throttleError(retryAfter, 'Too many score submissions. Try again later.');
  const input = await body(request);
  const result = await event.redeemScoreCode(member.id, input, key);
  return json(result, 201);
});
