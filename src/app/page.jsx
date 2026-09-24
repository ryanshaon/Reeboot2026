import Link from 'next/link';
import { GAME_META } from '@/components/public-data';

export default function HomePage() {
  return <main id="main">
    <section className="hero container"><div className="hero-content"><p className="eyebrow">The 2026 edition / Live today · 24 Sep 2026</p><h1>BREAK THE<br /><span>EXPECTED.</span></h1><p className="hero-copy">Four challenges. One team. Build, solve, and compete across the disciplines shaping what comes next.</p><div className="hero-actions"><Link className="button button-light" href="/enroll">Enroll your team <span aria-hidden="true">↗</span></Link><Link className="text-link" href="/join">Already enrolled? Join <span aria-hidden="true">→</span></Link></div></div><div className="hero-art" aria-hidden="true"><span className="hero-ring ring-a"/><span className="hero-ring ring-b"/><span className="hero-art-word">R<span>/</span></span><div className="checker"/></div></section>
    <section className="event-strip container" aria-label="Event details"><div><span>FORMAT</span><strong>Teams of 1-4</strong></div><div><span>TRACKS</span><strong>Four challenges</strong></div><div><span>EVENT DATE</span><strong>Today · 24 Sep 2026</strong></div><div><span>STATUS</span><strong>Enrollment open</strong></div></section>
    <section className="tracks-section container"><div className="section-head"><h2>FOUR WAYS<br />TO REBOOT.</h2><p>Different disciplines. One shared leaderboard. Bring a team that can move between ideas and execution.</p></div><div className="track-grid">{GAME_META.map((game) => <article className={`track-card track-${game.id}`} key={game.id}><div className="track-top"><span>{game.index} / 04</span><span>LIVE NOW</span></div><div><h3>{game.name}</h3><p>{game.description}</p></div></article>)}</div></section>
    <section className="closing-section container"><div className="closing-rule"/><h2>READY TO<br /><em>REWRITE</em> THE RULES?</h2><div className="closing-actions"><Link className="button button-light" href="/enroll">Enroll your team <span aria-hidden="true">↗</span></Link><Link className="text-link" href="/leaderboard">See the leaderboard <span aria-hidden="true">→</span></Link></div></section>
  </main>;
}
