import { event, handle, json } from '@/lib/api.js';

export const runtime = 'nodejs';
export const GET = handle(async () => json({ leaderboard: await event.leaderboard() }));
