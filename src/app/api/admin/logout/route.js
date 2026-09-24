import { handle, json, requireOrigin, clearSession } from '@/lib/api.js';

export const POST = handle(async (request) => { requireOrigin(request); return clearSession(json({ ok: true }), 'admin'); });
