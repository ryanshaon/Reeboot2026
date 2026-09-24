import { GAME_IDS } from './constants.js';

export const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const result = (ok, error) => ok ? { ok: true } : { ok: false, error };

export function validateEnrollment(input, allowedDomains = []) {
  if (!input || typeof input.teamName !== 'string' || input.teamName.trim().length < 2 || input.teamName.trim().length > 80) return result(false, 'Team name must be 2–80 characters.');
  if (!Array.isArray(input.members) || input.members.length < 1 || input.members.length > 4) return result(false, 'A team needs 1–4 members.');
  const hasKey = Object.hasOwn(input, 'enrollmentKey');
  const strongSecret = (value, minimumLength) => typeof value === 'string' && new RegExp(`^[A-Za-z0-9_-]{${minimumLength},128}$`).test(value) && new Set(value).size >= 16;
  if (hasKey && !strongSecret(input.enrollmentKey, 43)) return result(false, 'Enrollment key must be a high-entropy base64url string of 43–128 characters.');
  const seen = new Set();
  for (const member of input.members) {
    if (!member || typeof member.name !== 'string' || member.name.trim().length < 2 || member.name.trim().length > 80) return result(false, 'Every member needs a name of 2–80 characters.');
    const email = normalizeEmail(member.email);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return result(false, 'Every member needs a valid college email.');
    if (seen.has(email)) return result(false, 'Member emails must be unique.');
    seen.add(email);
    const domain = email.split('@')[1];
    if (allowedDomains.length ? !allowedDomains.includes(domain) : !/(?:^|\.)(?:edu|ac)(?:\.[a-z]{2})?$/.test(domain)) return result(false, 'Email domain is not allowed.');
    if (hasKey && !strongSecret(member.accessCode, 32)) return result(false, 'Every member needs a high-entropy base64url access code of 32–128 characters.');
    if (!hasKey && Object.hasOwn(member, 'accessCode')) return result(false, 'Client access codes require an enrollment key.');
  }
  return result(true);
}

export function validateScore(input) {
  if (!input || typeof input.memberId !== 'string' || !input.memberId.trim()) return result(false, 'Member is required.');
  if (!GAME_IDS.includes(input.gameId)) return result(false, 'Unknown game.');
  if (typeof input.score !== 'number' || !Number.isFinite(input.score) || input.score < 0 || input.score > 1_000_000) return result(false, 'Score must be between 0 and 1,000,000.');
  return result(true);
}

export function allowedEmailDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
}
