import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeScore, encodeValue, PRIME } from './score-code-fixtures.js';

async function decoder() {
  return (await import('../src/lib/score-code.js')).decodeScoreCode;
}

test('decodes known scores and accepts trimmed lowercase codes', async () => {
  const decodeScoreCode = await decoder();
  for (const score of [0, 1, 120, 5700]) {
    assert.equal(decodeScoreCode(encodeScore(score)), score);
  }
  assert.equal(decodeScoreCode(`  ${encodeScore(42).toLowerCase()}  `), 42);
});

test('rejects malformed, tampered, non-divisible and negative codes with one generic error', async () => {
  const decodeScoreCode = await decoder();
  const invalid = ['', 'ABCDE', 'ABCDEFG', 'ABC!EF', '１２３４５６', encodeValue(0n), encodeValue(98766n)];
  const messages = invalid.map((code) => {
    try { decodeScoreCode(code); return null; }
    catch (error) { assert.equal(error.status, 400); return error.message; }
  });
  assert.deepEqual(new Set(messages).size, 1);
  assert.notEqual(messages[0], null);
});

test('rejects non-ASCII characters even when uppercasing would make a valid code', async () => {
  const decodeScoreCode = await decoder();
  const valid = Array.from({ length: 5700 }, (_, score) => encodeScore(score)).find((code) => code.includes('I') || code.includes('S'));
  assert.ok(valid);
  const confusable = valid.includes('I') ? valid.replace('I', 'ı') : valid.replace('S', 'ſ');
  assert.throws(() => decodeScoreCode(confusable), { status: 400 });
});

test('uses a configurable key and rejects decoded scores above the policy limit', async () => {
  const decodeScoreCode = await decoder();
  assert.equal(decodeScoreCode(encodeScore(123, 12345n), '12345'), 123);
  const largeScoreKey = -PRIME * 1_000_001n;
  assert.throws(() => decodeScoreCode(encodeValue(0n, largeScoreKey), String(largeScoreKey)), { status: 400 });
});

test('production and deployment environments require a configured numeric score-code key', async () => {
  const { scoreCodeKey } = await import('../src/lib/score-code.js');
  assert.equal(scoreCodeKey({ NODE_ENV: 'development' }), '98765');
  assert.equal(scoreCodeKey({ NODE_ENV: 'test', SCORE_CODE_KEY: '12345' }), '12345');
  for (const env of [{ NODE_ENV: 'production' }, { VERCEL: '1' }, { DEPLOYMENT_ENV: 'production' }, { RENDER: 'true' }, { FLY_APP_NAME: 'app' }, { RAILWAY_ENVIRONMENT: 'production' }, { NODE_ENV: 'production', SCORE_CODE_KEY: 'abc' }, { SCORE_CODE_KEY: '' }]) {
    assert.throws(() => scoreCodeKey(env), { status: 503, message: 'Score code configuration is invalid.' });
  }
  assert.equal(scoreCodeKey({ NODE_ENV: 'production', SCORE_CODE_KEY: '314159' }), '314159');
});
