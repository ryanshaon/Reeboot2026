export function sameOrigin(request, env = process.env) {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const requestUrl = new URL(request.url);
      if (originUrl.origin === requestUrl.origin) return true;
      // Next may construct request.url with its internal hostname while the
      // browser-facing host remains in the Host header (for example localhost
      // versus 127.0.0.1 in local development or behind a reverse proxy).
      const browserFacingHost = request.headers.get('host');
      return Boolean(browserFacingHost && originUrl.host === browserFacingHost);
    }
    catch { return false; }
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin';
  return env.NODE_ENV !== 'production';
}

export function adminCredentials(env = process.env) {
  if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD) return { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD };
  return env.NODE_ENV === 'development' ? { username: 'admin', password: 'admin' } : null;
}
