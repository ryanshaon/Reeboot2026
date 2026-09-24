'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GAME_META, gameAction, scoreForTeam, normalizeScoreCode, draftFromScoreCodePaste, validScoreCode, scoreCodeFeedback, applyScoreResult, retryAfterNotice } from '@/components/public-data';
import { PageIntro } from '@/components/SiteChrome';
import './score-code.css';

export default function PlayPage() {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, member: null, games: [], scores: [], error: '' });
  const [leaving, setLeaving] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [pending, setPending] = useState({});
  const [feedback, setFeedback] = useState({});
  const inFlight = useRef(new Set());
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const meResponse = await fetch('/api/member/me', { signal: controller.signal, cache: 'no-store' });
        if (meResponse.status === 401) { setState({ loading: false, member: null, games: [], scores: [], error: '' }); return; }
        const me = await meResponse.json();
        if (!meResponse.ok) throw new Error(me.error || 'Unable to load your account.');
        const [gamesResponse, scoresResponse] = await Promise.all([fetch('/api/games', { signal: controller.signal, cache: 'no-store' }), fetch('/api/leaderboard', { signal: controller.signal, cache: 'no-store' })]);
        const [games, scores] = await Promise.all([gamesResponse.json(), scoresResponse.json()]);
        if (!gamesResponse.ok || !scoresResponse.ok) throw new Error(games.error || scores.error || 'Unable to load event data.');
        setState({ loading: false, member: me.member, games: games.games || [], scores: scores.leaderboard || [], error: '' });
      } catch (cause) { if (cause.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: cause.message || 'Unable to connect.' })); }
    }
    load(); return () => controller.abort();
  }, []);
  async function logout() {
    setLeaving(true);
    try { const response = await fetch('/api/member/logout', { method: 'POST' }); if (!response.ok) throw new Error('Could not sign out.'); router.push('/join'); router.refresh(); }
    catch (cause) { setState((current) => ({ ...current, error: cause.message })); setLeaving(false); }
  }
  async function submitScore(event, gameId) {
    event.preventDefault();
    if (inFlight.current.has(gameId)) return;
    if (!validScoreCode(drafts[gameId])) {
      setFeedback((current) => ({ ...current, [gameId]: { type: 'error', text: 'Enter a six-character score code using letters A–Z and numbers 0–9.' } }));
      return;
    }
    const code = normalizeScoreCode(drafts[gameId]);
    inFlight.current.add(gameId);
    setPending((current) => ({ ...current, [gameId]: true }));
    setFeedback((current) => ({ ...current, [gameId]: null }));
    try {
      const response = await fetch('/api/member/scores', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, code }),
      });
      if (response.status === 401) { router.push('/join'); return; }
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = data?.error || 'Unable to verify this score code. Please try again.';
        const retry = response.status === 429 ? retryAfterNotice(response.headers.get('Retry-After')) : '';
        throw new Error(retry ? `${detail} ${retry}` : detail);
      }
      setState((current) => ({ ...current, scores: applyScoreResult(current.scores, current.member.teamId, data) }));
      setDrafts((current) => ({ ...current, [gameId]: '' }));
      setFeedback((current) => ({ ...current, [gameId]: { type: 'success', text: scoreCodeFeedback(data) } }));
    } catch (cause) {
      setFeedback((current) => ({ ...current, [gameId]: { type: 'error', text: cause.message || 'Unable to verify this score code. Please try again.' } }));
    } finally {
      inFlight.current.delete(gameId);
      setPending((current) => ({ ...current, [gameId]: false }));
    }
  }
  if (state.loading) return <main id="main" className="container interior-main"><div className="loading-line"/><div className="loading-block"/><p className="muted">Loading player area...</p></main>;
  if (!state.member) return <main id="main" className="container interior-main"><PageIntro eyebrow="Player area" title={state.error ? 'CONNECTION LOST.' : 'ACCESS REQUIRED.'} description={state.error ? 'Your account could not be loaded right now.' : 'Sign in with your own college email and access code to view your team dashboard.'}/>{state.error ? <div className="notice-panel" role="alert"><p>{state.error}</p><button type="button" className="text-link" onClick={() => window.location.reload()}>Try again →</button></div> : <Link className="button button-light" href="/join">Join your team <span aria-hidden="true">↗</span></Link>}</main>;
  const score = scoreForTeam(state.scores, state.member.teamId);
  return <main id="main" className="container interior-main"><div className="dashboard-heading"><PageIntro eyebrow="Player area" title={`HELLO, ${state.member.name.split(' ')[0].toUpperCase()}.`} description="Your team, tracks, and best scores in one place."/><button className="text-link" type="button" onClick={logout} disabled={leaving}>{leaving ? 'Signing out...' : 'Sign out ↗'}</button></div>{state.error && <p className="form-error" role="alert">{state.error} <button type="button" className="inline-button" onClick={() => window.location.reload()}>Retry</button></p>}<div className="identity-strip"><div><span className="field-caption">TEAM</span><strong>{state.member.teamName}</strong></div><div><span className="field-caption">MEMBER</span><strong>{state.member.name}{state.member.isCaptain ? ' / Captain' : ''}</strong></div><div><span className="field-caption">TOTAL SCORE</span><strong className="big-number">{score.total}</strong></div></div><div className="section-head dashboard-section-head"><h2>CHOOSE A<br/>CHALLENGE.</h2><p>Games unlock here when they go live. Each member submits their own game-issued score code. Only the highest teammate score in each challenge counts toward the team total.</p></div><div className="dashboard-games">{GAME_META.map((meta) => { const game = state.games.find((item) => item.id === meta.id); const action = gameAction(game); const message = feedback[meta.id]; const helpId = `score-code-help-${meta.id}`; const feedbackId = `score-code-feedback-${meta.id}`; return <article className="dashboard-game" key={meta.id}><div className="dashboard-game-title"><span className="field-caption">{meta.index} / 04</span><h3>{game?.name || meta.name}</h3><p>{meta.description}</p></div><div className="dashboard-game-controls"><div className="dashboard-game-action"><span className="field-caption">TEAM BEST</span><strong>{score[meta.id] || 0}</strong>{action.enabled ? <a className="button button-light" href={action.url} target="_blank" rel="noopener noreferrer">Launch game ↗</a> : <button type="button" className="button button-disabled" disabled>{action.label}</button>}</div>{game?.status === 'live' && <form className="score-code-form" onSubmit={(event) => submitScore(event, meta.id)} noValidate><label htmlFor={`score-code-${meta.id}`}>Score code for {game.name || meta.name}</label><div className="score-code-entry"><input id={`score-code-${meta.id}`} type="text" inputMode="text" maxLength={6} pattern="[0-9A-Za-z]{6}" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={drafts[meta.id] || ''} onChange={(event) => { setDrafts((current) => ({ ...current, [meta.id]: normalizeScoreCode(event.target.value) })); setFeedback((current) => ({ ...current, [meta.id]: null })); }} onPaste={(event) => { event.preventDefault(); setDrafts((current) => ({ ...current, [meta.id]: draftFromScoreCodePaste(event.clipboardData.getData('text')) })); setFeedback((current) => ({ ...current, [meta.id]: null })); }} disabled={!!pending[meta.id]} aria-describedby={`${helpId} ${feedbackId}`} aria-invalid={message?.type === 'error'} aria-errormessage={message?.type === 'error' ? feedbackId : undefined}/><button type="submit" className="button button-outline" disabled={!!pending[meta.id]}>{pending[meta.id] ? 'Verifying...' : 'Submit code'}</button></div><span id={helpId} className="field-help">Six letters or numbers from your game.</span><p id={feedbackId} className={message ? (message.type === 'error' ? 'form-error score-code-feedback' : 'score-code-success score-code-feedback') : 'score-code-feedback'} role={message?.type === 'error' ? 'alert' : 'status'} aria-live={message?.type === 'error' ? 'assertive' : 'polite'} aria-atomic="true">{message?.text || ''}</p></form>}</div></article>; })}</div><div className="page-actions"><Link className="text-link" href="/leaderboard">View all team standings <span aria-hidden="true">→</span></Link></div></main>;
}
