import { handle, json, adminSession } from '@/lib/api.js';

export const GET = handle(async (request) => json({ authenticated: Boolean(adminSession(request)) }));
