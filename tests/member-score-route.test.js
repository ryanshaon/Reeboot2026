import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createConfiguredLoginThrottle } from '../src/lib/configured-login-throttle.js';

test('member score route authenticates before parsing and redeems only for the session member', async () => {
  const route = await readFile(new URL('../src/app/api/member/scores/route.js', import.meta.url), 'utf8');
  assert.match(route, /requireOrigin\(request\)/);
  const member = route.indexOf('requireMember(request)');
  const body = route.indexOf('body(request)');
  assert.ok(member >= 0 && body > member);
  assert.match(route, /if \(!member\).*401/s);
  assert.match(route, /event\.redeemScoreCode\(member\.id,\s*input,\s*key\)/);
  assert.ok(route.indexOf('const key = scoreCodeKey()') > member);
  assert.ok(route.indexOf('const key = scoreCodeKey()') < route.indexOf('scoreCodeThrottle.attempt('));
  assert.doesNotMatch(route, /input\.memberId|input\?\.memberId/);
});

test('member score route reserves member-keyed throttle before every redemption without clearing success', async () => {
  const route = await readFile(new URL('../src/app/api/member/scores/route.js', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8');
  assert.match(api, /export const scoreCodeThrottle = createConfiguredLoginThrottle\([^\n]*maxFailures: 12/);
  assert.match(route, /score-code:\$\{member\.id\}/);
  assert.ok(route.indexOf('scoreCodeThrottle.attempt(') < route.indexOf('event.redeemScoreCode('));
  assert.doesNotMatch(route, /scoreCodeThrottle\.success\(/);
  assert.match(route, /throttleError\(retryAfter,\s*'Too many score submissions\. Try again later\.'\)/);
  const throttle = createConfiguredLoginThrottle({ ALLOW_JSON_STORAGE: 'true' }, { maxFailures: 12 });
  for (let i = 0; i < 12; i += 1) assert.equal(await throttle.attempt('score-code:member-1'), 0);
  assert.ok(await throttle.attempt('score-code:member-1') > 0);
});

test('admin score POST and PUT retain the manual addScore path', async () => {
  const route = await readFile(new URL('../src/app/api/admin/scores/route.js', import.meta.url), 'utf8');
  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /event\.addScore\(await body\(request\)\)/);
  assert.match(route, /export const POST = save/);
  assert.match(route, /export const PUT = save/);
});
