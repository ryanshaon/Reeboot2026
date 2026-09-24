'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ADMIN_GAMES, editGameDraftState, filterTeams, gameDraftError, mergeGameDraftState, saveGameDraftState, scoreDraftError, summarizeTeams } from '@/components/admin-data';
import { AdminAttemptHistory } from '@/components/AdminAttemptHistory';
import './admin.css';

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const requestOptions = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const dateLabel = (value) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown';
const numberLabel = (value) => Number(value || 0).toLocaleString();

export default function AdminPage() {
  const [auth, setAuth] = useState('loading');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState('teams');
  const [teams, setTeams] = useState([]);
  const [games, setGames] = useState([]);
  const [dataBusy, setDataBusy] = useState(false);
  const [dataError, setDataError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [score, setScore] = useState({ memberId: '', gameId: 'aiml', score: '' });
  const [scoreBusy, setScoreBusy] = useState(false);
  const [scoreError, setScoreError] = useState('');
  const [scoreSuccess, setScoreSuccess] = useState('');
  const [gameDraftState, setGameDraftState] = useState({ drafts: {}, dirtyIds: [], feedback: {} });
  const [gameBusyIds, setGameBusyIds] = useState({});
  const activeLoad = useRef(0);
  const gameSaveRevision = useRef(0);
  const codeRevealRef = useRef(null);
  const [resetMemberId, setResetMemberId] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [newCode, setNewCode] = useState(null);
  const [copied, setCopied] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const loadData = useCallback(async (signal) => {
    const requestId = ++activeLoad.current;
    const saveRevisionAtStart = gameSaveRevision.current;
    setDataBusy(true); setDataError('');
    try {
      const [teamData, gameData] = await Promise.all([
        fetch('/api/admin/teams', { cache: 'no-store', credentials: 'same-origin', signal }).then(readResponse),
        fetch('/api/games', { cache: 'no-store', credentials: 'same-origin', signal }).then(readResponse),
      ]);
      if (requestId !== activeLoad.current || signal?.aborted) return;
      setTeams(teamData.teams || []);
      if (saveRevisionAtStart === gameSaveRevision.current) {
        setGames(gameData.games || []);
        setGameDraftState((current) => mergeGameDraftState(current, gameData.games || []));
      }
    } catch (error) {
      if (error.name === 'AbortError' || requestId !== activeLoad.current) return;
      if (error.status === 401) setAuth('signed-out');
      else setDataError(error.message || 'Could not load control room data.');
    } finally { if (requestId === activeLoad.current && !signal?.aborted) setDataBusy(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/session', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(readResponse)
      .then((data) => setAuth(data.authenticated ? 'signed-in' : 'signed-out'))
      .catch((error) => { if (error.name !== 'AbortError') { setAuth('error'); setLoginError(error.message || 'Could not check admin session.'); } });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (auth !== 'signed-in') return;
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [auth, loadData]);

  useEffect(() => { setResetMemberId(''); }, [query]);
  useEffect(() => { if (newCode) codeRevealRef.current?.focus(); }, [newCode]);

  const visibleTeams = useMemo(() => filterTeams(teams, query), [teams, query]);
  const selectedTeam = visibleTeams.find((team) => team.id === selectedId) || visibleTeams[0] || null;
  const summary = summarizeTeams(teams);
  const allMembers = teams.flatMap((team) => team.members.map((member) => ({ ...member, teamName: team.name })));
  const selectedMember = allMembers.find((member) => member.id === score.memberId);

  async function login(event) {
    event.preventDefault(); setLoginError(''); setLoginBusy(true);
    try {
      await readResponse(await fetch('/api/admin/login', requestOptions('POST', credentials)));
      setCredentials({ username: '', password: '' });
      setAuth('signed-in');
    } catch (error) { setLoginError(error.message || 'Could not sign in.'); }
    finally { setLoginBusy(false); }
  }

  async function logout() {
    setLogoutBusy(true); setLogoutError('');
    try {
      await readResponse(await fetch('/api/admin/logout', requestOptions('POST')));
      setAuth('signed-out'); setTeams([]); setGames([]); setNewCode(null); setResetMemberId('');
    } catch (error) { setLogoutError(error.message || 'Could not sign out.'); }
    finally { setLogoutBusy(false); }
  }

  async function submitScore(event) {
    event.preventDefault(); setScoreError(''); setScoreSuccess('');
    const error = scoreDraftError(score);
    if (error) { setScoreError(error); return; }
    setScoreBusy(true);
    try {
      const data = await readResponse(await fetch('/api/admin/scores', requestOptions('POST', { ...score, score: Number(score.score) })));
      const game = ADMIN_GAMES.find((item) => item.id === score.gameId);
      setScoreSuccess(`${numberLabel(data.attempt.score)} recorded for ${selectedMember?.name || 'member'} in ${game?.name || 'game'}. Team bests have been refreshed.`);
      setScore((current) => ({ ...current, score: '' }));
      await loadData();
    } catch (cause) { if (cause.status === 401) setAuth('signed-out'); else setScoreError(cause.message || 'Could not record score.'); }
    finally { setScoreBusy(false); }
  }

  async function saveGame(id) {
    if (gameBusyIds[id]) return;
    const draft = gameDraftState.drafts[id];
    const checked = gameDraftError(draft || {});
    if (checked.error) { setGameDraftState((current) => ({ ...current, feedback: { ...current.feedback, [id]: { error: checked.error } } })); return; }
    const submitted = { status: draft.status, url: checked.url || '' };
    setGameBusyIds((current) => ({ ...current, [id]: true }));
    setGameDraftState((current) => ({ ...current, feedback: { ...current.feedback, [id]: null } }));
    try {
      const data = await readResponse(await fetch(`/api/admin/games/${id}`, requestOptions('PATCH', { status: draft.status, url: checked.url })));
      gameSaveRevision.current += 1;
      setGames((current) => current.map((game) => game.id === id ? data.game : game));
      setGameDraftState((current) => saveGameDraftState(current, id, submitted, data.game));
    } catch (error) { if (error.status === 401) setAuth('signed-out'); else setGameDraftState((current) => ({ ...current, feedback: { ...current.feedback, [id]: { error: error.message || 'Could not save game.' } } })); }
    finally { setGameBusyIds((current) => ({ ...current, [id]: false })); }
  }

  async function resetCode() {
    if (newCode || !resetMemberId) return;
    setResetError(''); setResetBusy(true);
    try {
      const data = await readResponse(await fetch(`/api/admin/members/${resetMemberId}/reset-code`, requestOptions('POST')));
      const member = allMembers.find((item) => item.id === resetMemberId);
      setNewCode({ ...data, name: member?.name || 'Member' });
      setResetMemberId(''); setCopied(false);
      await loadData();
    } catch (error) { if (error.status === 401) setAuth('signed-out'); else setResetError(error.message || 'Could not reset code.'); }
    finally { setResetBusy(false); }
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(newCode.accessCode); setCopied(true); }
    catch { setCopied(false); }
  }

  if (auth === 'loading') return <main id="main" className="container interior-main admin-main"><div className="loading-line"/><div className="loading-block"/><p className="muted">Checking operator access...</p></main>;
  if (auth !== 'signed-in') return <main id="main" className="container interior-main admin-main"><div className="admin-auth"><div><p className="eyebrow">Operator access</p><h1>CONTROL<br/>ROOM.</h1><p>Sign in to manage teams, record scores, and control game availability.</p></div><form className="admin-auth-form" onSubmit={login}><h2>Admin sign in</h2><div className="field"><label htmlFor="admin-username">Username</label><input id="admin-username" autoComplete="username" value={credentials.username} onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))} required /></div><div className="field"><label htmlFor="admin-password">Password</label><input id="admin-password" type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} required /></div>{loginError && <p className="form-error" role="alert">{loginError}</p>}<button className="button button-light" type="submit" disabled={loginBusy}>{loginBusy ? 'Signing in...' : 'Enter control room'}</button>{auth === 'error' && <button className="text-link" type="button" onClick={() => window.location.reload()}>Retry session check</button>}</form></div></main>;

  return <main id="main" className="container interior-main admin-main">
    <div className="admin-title-row"><div><p className="eyebrow">REBOOT 2026 / OPERATOR</p><h1>CONTROL ROOM.</h1><p className="intro-copy">Teams, scores, and game access in one place.</p></div><button type="button" className="text-link" onClick={logout} disabled={logoutBusy}>{logoutBusy ? 'Signing out...' : 'Sign out ↗'}</button></div>
    {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
    <nav className="admin-tabs" aria-label="Control room sections">{[['teams', 'Overview / Teams'], ['scores', 'Score entry'], ['games', 'Games']].map(([id, label]) => <button type="button" key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setResetMemberId(''); }}>{label}</button>)}</nav>
    {newCode && <div className="admin-code-reveal" role="status" tabIndex={-1} ref={codeRevealRef}><strong>Replacement code for {newCode.name}</strong><p>Save this now. It cannot be retrieved after you leave this page. Share it privately with the named member. Save this code before resetting another member.</p><code>{newCode.accessCode}</code><div className="admin-actions"><button type="button" className="button button-outline" onClick={copyCode}>{copied ? 'Copied' : 'Copy code'}</button><button type="button" className="text-link" onClick={() => setNewCode(null)}>I have saved it</button></div></div>}
    {dataError && <div className="admin-message" role="alert"><strong>Control room data unavailable.</strong><p>{dataError}</p><button type="button" className="button button-outline" onClick={() => loadData()} disabled={dataBusy}>{dataBusy ? 'Retrying...' : 'Try again'}</button></div>}
    {dataBusy && teams.length === 0 && games.length === 0 ? <div className="admin-loading"><div className="loading-line"/><div className="loading-block"/><div className="loading-block"/><p>Loading event data...</p></div> : dataError && teams.length === 0 && games.length === 0 ? null : <>
      {tab === 'teams' && <section aria-label="Teams overview"><div className="admin-stat-grid"><div><span>TEAMS ENROLLED</span><strong>{summary.teamCount}</strong></div><div><span>MEMBERS</span><strong>{summary.memberCount}</strong></div><div><span>TEAMS WITH SCORES</span><strong>{summary.scoredTeams}</strong></div></div><div className="admin-section-head"><div><h2>THE ROSTER.</h2><p>Search a team or member. Select a team for its roster and current best scores.</p></div><button className="text-link" type="button" onClick={() => loadData()} disabled={dataBusy}>{dataBusy ? 'Refreshing...' : 'Refresh data ↗'}</button></div><div className="field admin-search"><label htmlFor="team-search">Search teams or members</label><input id="team-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Team, member, or college email"/></div>{teams.length === 0 ? <div className="admin-empty"><h3>NO TEAMS YET.</h3><p>Teams appear here after captains complete enrollment.</p></div> : visibleTeams.length === 0 ? <div className="admin-empty"><h3>NO MATCHES.</h3><p>Try another team name, member name, or email.</p><button type="button" className="text-link" onClick={() => setQuery('')}>Clear search</button></div> : <div className="admin-team-layout"><div className="admin-team-list" aria-label="Team list">{visibleTeams.map((team) => <button type="button" key={team.id} className={selectedTeam?.id === team.id ? 'selected' : ''} onClick={() => { setSelectedId(team.id); setResetMemberId(''); }} aria-pressed={selectedTeam?.id === team.id}><span>{team.name}</span><small>{team.members.length} {team.members.length === 1 ? 'member' : 'members'}</small><strong>{numberLabel(team.scores.total)}</strong></button>)}</div><article className="admin-team-detail" aria-label={`${selectedTeam.name} details`}><div className="admin-detail-head"><div><p className="field-caption">TEAM RECORD</p><h3>{selectedTeam.name}</h3></div><div><span>ENROLLED</span><strong>{dateLabel(selectedTeam.createdAt)}</strong></div></div><div className="admin-score-grid">{ADMIN_GAMES.map((game) => <div key={game.id}><span>{game.name}</span><strong>{numberLabel(selectedTeam.scores[game.id])}</strong></div>)}<div className="admin-total"><span>TOTAL</span><strong>{numberLabel(selectedTeam.scores.total)}</strong></div></div><p className="admin-rule-note">Each game uses the highest attempt by any team member. The total is the sum of the four game bests. Every recorded attempt appears below for audit.</p><h4>TEAM MEMBERS</h4><div className="admin-member-list">{selectedTeam.members.map((member) => <div className="admin-member" key={member.id}><div><strong>{member.name}{member.isCaptain || selectedTeam.captainId === member.id ? <span className="admin-captain">Captain</span> : null}</strong><span>{member.email}</span><small>Joined {dateLabel(member.createdAt)}</small></div><button type="button" className="text-link" onClick={() => { setResetMemberId(member.id); setResetError(''); }} disabled={Boolean(newCode)} title={newCode ? 'Save the current replacement code first.' : undefined}>Reset code</button></div>)}</div>{resetMemberId && <div className="admin-confirm" role="group" aria-label="Confirm code reset"><strong>Reset {selectedTeam.members.find((member) => member.id === resetMemberId)?.name}&apos;s code?</strong><p>The current code and active member sessions will stop working. The replacement is shown once. Save it and deliver it privately.</p>{resetError && <p className="form-error" role="alert">{resetError}</p>}<div className="admin-actions"><button type="button" className="button button-light" onClick={resetCode} disabled={resetBusy}>{resetBusy ? 'Resetting...' : 'Confirm reset'}</button><button type="button" className="button button-outline" onClick={() => setResetMemberId('')} disabled={resetBusy}>Cancel</button></div></div>}<AdminAttemptHistory team={selectedTeam}/></article></div>}</section>}
      {tab === 'scores' && <section aria-label="Score entry" className="admin-workspace"><div className="admin-section-head"><div><h2>RECORD A SCORE.</h2><p>Enter an attempt for one member. Lower attempts remain stored and do not replace a higher team best.</p></div></div>{allMembers.length === 0 ? <div className="admin-empty"><h3>NO MEMBERS YET.</h3><p>Enroll a team before recording an attempt.</p></div> : <form className="admin-score-form" onSubmit={submitScore} noValidate><div className="field"><label htmlFor="score-member">Team member</label><select id="score-member" value={score.memberId} onChange={(event) => setScore((current) => ({ ...current, memberId: event.target.value }))}><option value="">Select member</option>{teams.map((team) => <optgroup key={team.id} label={team.name}>{team.members.map((member) => <option value={member.id} key={member.id}>{member.name} ({member.email})</option>)}</optgroup>)}</select></div><div className="field"><label htmlFor="score-game">Game</label><select id="score-game" value={score.gameId} onChange={(event) => setScore((current) => ({ ...current, gameId: event.target.value }))}>{ADMIN_GAMES.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></div><div className="field"><label htmlFor="score-value">Score</label><input id="score-value" type="number" min="0" max="1000000" step="any" inputMode="decimal" value={score.score} onChange={(event) => setScore((current) => ({ ...current, score: event.target.value }))} placeholder="0 to 1,000,000"/><span className="field-help">Valid range: 0 to 1,000,000.</span></div>{scoreError && <p className="form-error" role="alert">{scoreError}</p>}{scoreSuccess && <p className="admin-success" role="status">{scoreSuccess}</p>}<button type="submit" className="button button-light" disabled={scoreBusy}>{scoreBusy ? 'Recording...' : 'Record attempt'}</button></form>}<aside className="admin-side-note"><span className="field-caption">SCORING RULE</span><strong>BEST OF FOUR.</strong><p>For each game, the team earns its highest score from any member. The four game bests add to the total.</p><p>Inspect each team's individual attempts in Overview / Teams.</p></aside></section>}
      {tab === 'games' && <section aria-label="Game settings"><div className="admin-section-head"><div><h2>GAME ACCESS.</h2><p>Set status and launch URL for each challenge. A live game needs a URL before players can launch it.</p></div></div><div className="admin-games-list">{ADMIN_GAMES.map((meta) => { const game = games.find((item) => item.id === meta.id); const draft = gameDraftState.drafts[meta.id] || { status: game?.status || 'coming_soon', url: game?.url || '' }; const feedback = gameDraftState.feedback[meta.id]; const dirty = gameDraftState.dirtyIds.includes(meta.id); return <form className="admin-game-row" key={meta.id} onSubmit={(event) => { event.preventDefault(); saveGame(meta.id); }}><div className="admin-game-name"><span className="field-caption">{meta.id.toUpperCase()}</span><h3>{meta.name}</h3></div><div className="field"><label htmlFor={`game-status-${meta.id}`}>Status</label><select id={`game-status-${meta.id}`} value={draft.status} onChange={(event) => { setGameDraftState((current) => editGameDraftState(current, meta.id, { status: event.target.value })); }}><option value="coming_soon">Coming soon</option><option value="live">Live</option><option value="closed">Closed</option></select></div><div className="field"><label htmlFor={`game-url-${meta.id}`}>Launch URL</label><input id={`game-url-${meta.id}`} type="url" inputMode="url" value={draft.url} onChange={(event) => { setGameDraftState((current) => editGameDraftState(current, meta.id, { url: event.target.value })); }} placeholder="https://example.com/game"/><span className="field-help">Optional. Leave blank to unset.</span></div><div className="admin-game-save">{dirty && <p className="field-help">Unsaved changes</p>}<button type="submit" className="button button-outline" disabled={Boolean(gameBusyIds[meta.id])}>{Boolean(gameBusyIds[meta.id]) ? 'Saving...' : 'Save game'}</button>{feedback?.error && <p className="form-error" role="alert">{feedback.error}</p>}{feedback?.success && <p className="admin-success" role="status">{feedback.success}</p>}</div></form>; })}</div></section>}
    </>}
  </main>;
}
