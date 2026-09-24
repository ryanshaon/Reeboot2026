import Link from 'next/link';

export function SiteHeader() {
  return <header className="site-header"><div className="header-inner">
    <Link href="/" className="brand" aria-label="Reboot 2026 home"><span className="brand-symbol">R<span className="brand-cut">/</span></span><span>REBOOT<span className="brand-year">26</span></span></Link>
    <nav aria-label="Main navigation" className="nav-links"><Link href="/enroll">Enroll</Link><Link href="/join">Join</Link><Link href="/leaderboard">Leaderboard</Link><Link href="/play" className="nav-play">Player area <span aria-hidden="true">↗</span></Link></nav>
  </div></header>;
}

export function SiteFooter() {
  return <footer className="site-footer"><div className="footer-inner"><div className="footer-brand">REBOOT <span>2026</span></div><div className="footer-copy">Four challenges. One team. Your next move starts here.</div><nav aria-label="Footer navigation"><Link href="/enroll">Enroll</Link><Link href="/join">Join</Link><Link href="/leaderboard">Standings</Link></nav></div></footer>;
}

export function PageIntro({ eyebrow, title, description }) {
  return <div className="page-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="intro-copy">{description}</p></div>;
}
