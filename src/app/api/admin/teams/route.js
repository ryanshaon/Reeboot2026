import { event, handle, json, requireAdmin } from '@/lib/api.js';

export const runtime = 'nodejs';
export const GET = handle(async (request) => { requireAdmin(request); return json({ teams: await event.adminTeams() }); });
