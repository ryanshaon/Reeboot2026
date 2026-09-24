const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PRIME = 381001n;
const RADIX = 36n;
const INVALID_CODE = 'Invalid score code.';

function invalidCode() { return Object.assign(new Error(INVALID_CODE), { status: 400 }); }
function invalidConfiguration() { return Object.assign(new Error('Score code configuration is invalid.'), { status: 503 }); }

export function scoreCodeKey(env = process.env) {
  const key = env.SCORE_CODE_KEY;
  const deployed = env.NODE_ENV === 'production' || env.VERCEL || env.DEPLOYMENT_ENV === 'production' || env.RENDER || env.FLY_APP_NAME || env.RAILWAY_ENVIRONMENT;
  if (key === undefined && !deployed) return '98765';
  if (typeof key !== 'string' || !/^-?\d+$/.test(key)) throw invalidConfiguration();
  return key;
}

export function decodeScoreCode(rawCode, rawKey = scoreCodeKey()) {
  if (typeof rawCode !== 'string') throw invalidCode();
  const trimmed = rawCode.trim();
  if (!/^[0-9A-Za-z]{6}$/.test(trimmed)) throw invalidCode();
  const code = trimmed.toUpperCase();
  if (!/^-?\d+$/.test(String(rawKey))) throw invalidConfiguration();
  const key = BigInt(rawKey);
  let value = 0n;
  let place = 1n;
  for (let i = 0; i < 6; i += 1) {
    const character = BigInt(CHARSET.indexOf(code[i]));
    const digit = ((character - key - BigInt(i)) % RADIX + RADIX) % RADIX;
    value += digit * place;
    place *= RADIX;
  }
  const numerator = value - key;
  if (numerator < 0n || numerator % PRIME !== 0n) throw invalidCode();
  const score = numerator / PRIME;
  if (score > 1_000_000n || score > BigInt(Number.MAX_SAFE_INTEGER)) throw invalidCode();
  return Number(score);
}
