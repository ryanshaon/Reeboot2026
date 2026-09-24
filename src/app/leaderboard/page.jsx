'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PageIntro } from '@/components/SiteChrome';
import { leaderboardView } from '@/components/public-data';

export default function LeaderboardPage() {
  const [state, setState] = useState({ loading: true, teams: [], error: '' });
  const [refreshing, setRefreshing] = useState(false);
  const activeRequest = useRef(0);
  const load = useCallback(async (signal) => {
    const requestId = ++activeRequest.current;
    setRefreshing(true);
    try {
      const response = await fetch('/api/leaderboard', { cache: 'no-store', signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load standings.');
      if (requestId === activeRequest.current) setState({ loading: false, teams: data.leaderboard || [], error: '' });
    } catch (cause) { if (cause.name !== 'AbortError' && requestId === activeRequest.current) setState((current) => ({ ...current, loading: false, error: cause.message || 'Unable to connect.' })); }
    finally { if (requestId === activeRequest.current) setRefreshing(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  const view = leaderboardView(state);
  return <main id="main" className="container interior-main"><div className="dashboard-heading"><PageIntro eyebrow="Live standings" title="THE LEADERBOARD." description="The best score in each challenge counts. Follow every team as the rankings take shape."/><button type="button" className="button button-outline" onClick={() => load()} disabled={refreshing || state.loading}>{refreshing ? 'Refreshing...' : 'Refresh scores'}</button></div>{view === 'error' && <div className="notice-panel" role="alert"><strong>Standings unavailable.</strong><p>{state.error}</p><button type="button" className="text-link" onClick={() => load()} disabled={refreshing}>{refreshing ? 'Retrying...' : 'Try again →'}</button></div>}{view === 'loading' ? <div className="leaderboard-loading"><div className="loading-line"/><div className="loading-block"/><div className="loading-block"/><p>Loading standings...</p></div> : view === 'empty' ? <div className="empty-state"><span className="empty-mark">R/</span><h2>THE GRID IS OPEN.</h2><p>No teams have enrolled yet. Be the first to claim a place on the board.</p><Link className="button button-light" href="/enroll">Enroll your team <span aria-hidden="true">↗</span></Link></div> : view === 'ranked' ? <><div className="leaderboard-summary"><span>{state.teams.length} {state.teams.length === 1 ? 'TEAM' : 'TEAMS'} IN THE GRID</span><span>RANKED BY TOTAL SCORE</span></div><div className="table-scroll"><table className="leaderboard-table"><caption className="sr-only">REBOOT 2026 team rankings and best scores by challenge</caption><thead><tr><th scope="col">Rank</th><th scope="col">Team</th><th scope="col">AI / ML</th><th scope="col">SYS / COM</th><th scope="col">Game dev</th><th scope="col">Web dev</th><th scope="col">Total</th></tr></thead><tbody>{state.teams.map((team, index) => <tr key={team.teamId} className={index < 3 ? 'top-team' : ''}><td data-label="Rank"><span className="rank-number">{String(index + 1).padStart(2, '0')}</span></td><th scope="row" data-label="Team">{team.teamName}</th><td data-label="AI / ML">{team.aiml ?? 0}</td><td data-label="SYS / COM">{team.syscom ?? 0}</td><td data-label="Game dev">{team.gamedev ?? 0}</td><td data-label="Web dev">{team.webdev ?? 0}</td><td data-label="Total" className="total-cell">{team.total ?? 0}</td></tr>)}</tbody></table></div></> : null}</main>;
}
