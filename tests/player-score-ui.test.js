import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/app/play/page.jsx', import.meta.url), 'utf8');

test('live games expose a labelled score code form independently of launch URL', () => {
  assert.match(page, /game\?\.status === 'live'/);
  assert.match(page, /<form[^>]*onSubmit=\{[^}]+\}/);
  assert.match(page, /<label[^>]*htmlFor=\{`score-code-\$\{meta\.id\}`\}/);
  assert.match(page, /id=\{`score-code-\$\{meta\.id\}`\}/);
  assert.match(page, /maxLength=\{6\}/);
  assert.match(page, /pattern="\[0-9A-Za-z\]\{6\}"/);
  assert.match(page, /autoComplete="off"/);
  assert.match(page, /spellCheck=\{false\}/);
});

test('submission uses authenticated JSON POST without putting codes in URLs', () => {
  assert.match(page, /fetch\('\/api\/member\/scores',\s*\{[^}]*method:\s*'POST'/s);
  assert.match(page, /credentials:\s*'same-origin'/);
  assert.match(page, /JSON\.stringify\(\{\s*gameId,\s*code\s*\}\)/);
  assert.match(page, /response\.status === 401/);
  assert.match(page, /router\.push\('\/join'\)/);
  assert.match(page, /role="alert"/);
  assert.match(page, /role=\{message\?\.type === 'error' \? 'alert' : 'status'\}/);
  assert.match(page, /setState\(\(current\) =>[\s\S]*applyScoreResult/);
});

test('score input and paste use ASCII folding before the browser length limit', () => {
  assert.match(page, /onChange=\{\(event\) => \{ setDrafts\(\(current\) => \(\{ \.\.\.current, \[meta\.id\]: normalizeScoreCode\(event\.target\.value\)/);
  assert.match(page, /onPaste=\{\(event\) => \{ event\.preventDefault\(\);/);
  assert.match(page, /event\.clipboardData\.getData\('text'\)/);
  assert.match(page, /draftFromScoreCodePaste\(event\.clipboardData\.getData\('text'\)\)/);
  assert.doesNotMatch(page, /event\.target\.value\.toUpperCase\(\)/);
});

test('each score field keeps a stable feedback region and accessible error references', () => {
  assert.match(page, /const helpId = `score-code-help-\$\{meta\.id\}`/);
  assert.match(page, /const feedbackId = `score-code-feedback-\$\{meta\.id\}`/);
  assert.match(page, /aria-describedby=\{`\$\{helpId\} \$\{feedbackId\}`\}/);
  assert.match(page, /aria-invalid=\{message\?\.type === 'error'\}/);
  assert.match(page, /aria-errormessage=\{message\?\.type === 'error' \? feedbackId : undefined\}/);
  assert.match(page, /<p id=\{feedbackId\}[^>]*role=\{message\?\.type === 'error' \? 'alert' : 'status'\}[^>]*aria-live=\{message\?\.type === 'error' \? 'assertive' : 'polite'\}[^>]*aria-atomic="true"[^>]*>\{message\?\.text \|\| ''\}<\/p>/);
  assert.doesNotMatch(page, /\{message && <p/);
});

test('429 score errors include safe Retry-After guidance', () => {
  assert.match(page, /response\.status === 429/);
  assert.match(page, /response\.headers\.get\('Retry-After'\)/);
  assert.match(page, /retryAfterNotice\(response\.headers\.get\('Retry-After'\)\)/);
  assert.match(page, /data\?\.error \|\| 'Unable to verify this score code\. Please try again\.'/);
});
