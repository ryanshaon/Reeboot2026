'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageIntro } from '@/components/SiteChrome';
import { attemptForDraft, receiptCanNavigate, validateTeamDraft } from '@/components/public-data';

const blankMember = () => ({ name: '', email: '' });

export default function EnrollPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState('');
  const [members, setMembers] = useState([blankMember()]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [enrolled, setEnrolled] = useState(null);
  const [copied, setCopied] = useState('');
  const [savedCodes, setSavedCodes] = useState(false);
  const [attempt, setAttempt] = useState(null);

  useEffect(() => {
    if (!enrolled || receiptCanNavigate(savedCodes)) return;
    function warnBeforeUnload(event) { event.preventDefault(); event.returnValue = ''; }
    function warnForLinks(event) {
      const link = event.target.closest?.('a[href]');
      if (link && !window.confirm('Have you saved every member’s private access code? Leaving this page will hide them.')) event.preventDefault();
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', warnForLinks, true);
    return () => { window.removeEventListener('beforeunload', warnBeforeUnload); document.removeEventListener('click', warnForLinks, true); };
  }, [enrolled, savedCodes]);

  function changeMember(index, field, value) { setAttempt(null); setMembers((current) => current.map((member, i) => i === index ? { ...member, [field]: value } : member)); }
  function removeMember(index) { setAttempt(null); setMembers((current) => current.filter((_, i) => i !== index)); }
  async function submit(event) {
    event.preventDefault();
    setError('');
    const draft = { teamName: teamName.trim(), members: members.map((member) => ({ name: member.name.trim(), email: member.email.trim() })) };
    const invalid = validateTeamDraft(draft);
    if (invalid) { setError(invalid); return; }
    const currentAttempt = attemptForDraft(attempt, draft);
    setAttempt(currentAttempt);
    const enrollment = {
      ...draft,
      enrollmentKey: currentAttempt.enrollmentKey,
      members: draft.members.map((member, index) => ({ ...member, accessCode: currentAttempt.accessCodes[index] })),
    };
    setPending(true);
    try {
      const response = await fetch('/api/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(enrollment) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Enrollment failed. Please try again.');
      setEnrolled(data);
    } catch (cause) { setError(cause.message || 'Unable to connect. Please try again.'); }
    finally { setPending(false); }
  }
  async function copyCode(member) {
    try { await navigator.clipboard.writeText(member.accessCode); setCopied(member.id); }
    catch { setCopied(''); }
  }

  if (enrolled) return <main id="main" className="container interior-main"><PageIntro eyebrow="Enrollment complete" title="YOUR TEAM IS IN." description={`${enrolled.team.name} is registered. Save each member's private access code now. This is the only time these codes will be shown.`}/><div className="notice-panel"><strong>Keep these codes private.</strong><p>Share each code only with its named member. Each person uses their college email and code to sign in. Copy or write them down before leaving this page.</p></div><div className="code-list">{enrolled.members.map((member) => <article className="code-row" key={member.id}><div><span className="field-caption">{member.isCaptain ? 'CAPTAIN' : 'TEAM MEMBER'}</span><h2>{member.name}</h2><p>{member.email}</p></div><div className="code-value"><code>{member.accessCode}</code><button type="button" className="button button-outline" onClick={() => copyCode(member)} aria-label={`Copy access code for ${member.name}`}>{copied === member.id ? 'Copied' : 'Copy code'}</button></div></article>)}</div><label className="save-confirmation"><input type="checkbox" checked={savedCodes} onChange={(event) => setSavedCodes(event.target.checked)}/><span>I have saved every member’s private access code.</span></label><div className="page-actions"><button type="button" className="button button-light" disabled={!receiptCanNavigate(savedCodes)} onClick={() => router.push('/play')}>Continue to player area <span aria-hidden="true">↗</span></button><button type="button" className="text-link" disabled={!receiptCanNavigate(savedCodes)} onClick={() => router.push('/leaderboard')}>View leaderboard <span aria-hidden="true">→</span></button></div></main>;

  return <main id="main" className="container interior-main"><PageIntro eyebrow="Team enrollment" title="ENTER THE GRID." description="A captain enrolls the team. Add up to four members, each with their own college email."/><div className="form-layout"><form onSubmit={submit} noValidate className="editorial-form"><div className="field"><label htmlFor="team-name">Team name</label><input id="team-name" autoComplete="organization" maxLength={80} value={teamName} onChange={(e) => { setAttempt(null); setTeamName(e.target.value); }} required placeholder="Your team name"/><span className="field-help">2-80 characters</span></div><div className="form-divider"><h2>Team members</h2><span>{members.length} / 4</span></div>{members.map((member, index) => <fieldset className="member-fields" key={index}><legend>{index === 0 ? 'Captain' : `Member ${index + 1}`}</legend>{index > 0 && <button type="button" className="remove-link" onClick={() => removeMember(index)}>Remove</button>}<div className="member-grid"><div className="field"><label htmlFor={`member-name-${index}`}>Full name</label><input id={`member-name-${index}`} autoComplete="name" maxLength={80} value={member.name} onChange={(e) => changeMember(index, 'name', e.target.value)} required placeholder="Full name"/></div><div className="field"><label htmlFor={`member-email-${index}`}>College email</label><input id={`member-email-${index}`} type="email" autoComplete="email" value={member.email} onChange={(e) => changeMember(index, 'email', e.target.value)} required placeholder="name@college.edu"/></div></div></fieldset>)}{members.length < 4 && <button type="button" className="add-member" onClick={() => { setAttempt(null); setMembers((current) => [...current, blankMember()]); }}>+ Add a member</button>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-light submit-button" type="submit" disabled={pending}>{pending ? 'Enrolling team...' : 'Enroll team'} <span aria-hidden="true">↗</span></button></form><aside className="form-aside"><span className="aside-mark">R/</span><h2>ONE TEAM.<br/>FOUR WAYS<br/>FORWARD.</h2><p>The first member is your captain. After enrollment, every member receives a private access code to enter the player area.</p><Link href="/join">Already have a code? Join your team →</Link></aside></div></main>;
}
