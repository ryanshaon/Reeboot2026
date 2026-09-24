import { NextResponse } from 'next/server';
import { createConfiguredStore } from './configured-store.js';
import { createEventService } from './event-service.js';
import { sameOrigin, adminCredentials } from './http.js';
import { signSession, verifyMemberSession, sessionSecret, adminCredentialFingerprint, verifyAdminSession } from './session.js';
import { createConfiguredLoginThrottle } from './configured-login-throttle.js';
import { errorResponse } from './error-response.js';

const store = createConfiguredStore();
export const event = createEventService(store);
const memberCookie = 'enigma_member';
const adminCookie = 'enigma_admin';
export const memberLoginThrottle = createConfiguredLoginThrottle();
export const memberGlobalLoginThrottle = createConfiguredLoginThrottle(process.env, { maxFailures: 100 });
export const adminLoginThrottle = createConfiguredLoginThrottle();
export const scoreCodeThrottle = createConfiguredLoginThrottle(process.env, { maxFailures: 12 });

export const json = (data, status = 200) => NextResponse.json(data, { status });
export function fail(error) { const response = errorResponse(error); return NextResponse.json(response.body, { status: response.status, headers: response.headers }); }
export function handle(callback) { return async (request, context) => { try { return await callback(request, context); } catch (error) { return fail(error); } }; }
export function requireOrigin(request) { if (!sameOrigin(request)) throw Object.assign(new Error('Cross-origin request rejected.'), { status: 403 }); }
export async function body(request) {
  try { return await request.json(); }
  catch { throw Object.assign(new Error('Invalid JSON body.'), { status: 400 }); }
}
export function setSession(response, role, id, sessionVersion) {
  const name = role === 'admin' ? adminCookie : memberCookie;
  const secret = sessionSecret();
  const payload = role === 'admin' ? { role, credentialVersion: adminCredentialFingerprint(adminCredentials(), secret) } : { role, memberId: id, sessionVersion };
  response.cookies.set(name, signSession(payload, secret), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 14 });
  return response;
}
export function clearSession(response, role) {
  response.cookies.set(role === 'admin' ? adminCookie : memberCookie, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}
function readCookie(request, name) { return request.cookies.get(name)?.value; }
export async function requireMember(request) {
  const token = readCookie(request, memberCookie);
  const memberId = await verifyMemberSession(token, sessionSecret(), (id) => event.memberById(id));
  return memberId ? event.memberById(memberId) : null;
}
export function adminSession(request) { return verifyAdminSession(readCookie(request, adminCookie), sessionSecret(), adminCredentials()); }
export function requireAdmin(request) { if (!adminSession(request)) throw Object.assign(new Error('Admin sign-in required.'), { status: 401 }); }
export function throttleError(seconds, message = 'Too many login attempts. Try again later.') { return Object.assign(new Error(message), { status: 429, retryAfter: seconds }); }
