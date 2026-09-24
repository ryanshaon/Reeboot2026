'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageIntro } from '@/components/SiteChrome';

export default function JoinPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setError('');
    if (!email.trim() || !accessCode.trim()) { setError('Enter your email and access code.'); return; }
    setPending(true);
    try {
      const response = await fetch('/api/member/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), accessCode: accessCode.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sign in failed. Please try again.');
      router.push('/play'); router.refresh();
    } catch (cause) { setError(cause.message || 'Unable to connect. Please try again.'); }
    finally { setPending(false); }
  }
  return <main id="main" className="container interior-main"><PageIntro eyebrow="Member access" title="WELCOME BACK." description="Every team member signs in with their own college email and private access code."/><div className="join-layout"><form className="editorial-form" onSubmit={submit} noValidate><div className="field"><label htmlFor="join-email">College email</label><input id="join-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@college.edu"/></div><div className="field"><label htmlFor="join-code">Access code</label><input id="join-code" type="password" autoComplete="current-password" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} required placeholder="Your private code"/></div>{error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="button button-light submit-button" disabled={pending}>{pending ? 'Signing in...' : 'Enter player area'} <span aria-hidden="true">↗</span></button><p className="form-footnote">Your captain received your code at enrollment. Ask them if you have not saved it.</p></form><aside className="join-aside"><span>NEW TO REBOOT?</span><h2>ASSEMBLE<br/>YOUR TEAM.</h2><p>One captain can enroll a team of up to four people.</p><Link className="text-link" href="/enroll">Enroll a team <span aria-hidden="true">→</span></Link></aside></div></main>;
}
