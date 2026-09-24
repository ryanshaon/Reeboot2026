export function errorResponse(error, log = console.error) {
  const status = Number.isInteger(error?.status) && ((error.status >= 400 && error.status < 500) || error.status === 503) ? error.status : 500;
  if (status === 500) log('API error:', error);
  const body = { error: status === 500 ? 'Internal server error.' : error?.message || 'Request failed.' };
  const headers = status === 429 && Number.isFinite(error?.retryAfter) ? { 'Retry-After': String(Math.max(1, Math.ceil(error.retryAfter))) } : {};
  return { status, body, headers };
}
