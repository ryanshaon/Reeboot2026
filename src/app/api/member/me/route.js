import { handle, json, requireMember } from '@/lib/api.js';

export const runtime = 'nodejs';
export const GET = handle(async (request) => {
  const member = await requireMember(request);
  return member ? json({ member }) : json({ member: null }, 401);
});
