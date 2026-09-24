import { attemptRows } from './admin-data';

export function AdminAttemptHistory({ team }) {
  const attempts = attemptRows(team);
  return <section className="admin-history" aria-labelledby="admin-history-title">
    <div className="admin-history-head"><div><h3 id="admin-history-title">ATTEMPT HISTORY.</h3><p>{team.name} / {attempts.length} {attempts.length === 1 ? 'attempt' : 'attempts'} / newest first</p></div></div>
    {attempts.length === 0 ? <div className="admin-history-empty"><strong>No attempts recorded.</strong><p>Recorded scores for this team will appear here.</p></div> : <div className="admin-history-table-wrap"><table className="admin-history-table"><caption className="sr-only">Score attempts for {team.name}, newest first</caption><thead><tr><th scope="col">Member</th><th scope="col">Game</th><th scope="col">Score</th><th scope="col">Recorded</th></tr></thead><tbody>{attempts.map((attempt) => <tr key={attempt.id}><th scope="row" data-label="Member">{attempt.memberName}</th><td data-label="Game">{attempt.gameName}</td><td data-label="Score">{Number(attempt.score).toLocaleString()}</td><td data-label="Recorded"><time dateTime={attempt.createdAt}>{new Date(attempt.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></td></tr>)}</tbody></table></div>}
  </section>;
}
