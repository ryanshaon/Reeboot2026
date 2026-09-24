import './globals.css';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';

export const metadata = {
  title: { default: 'REBOOT 2026', template: '%s | REBOOT 2026' },
  description: 'A four-track team challenge in AI/ML, systems, game development, and web development.',
};

export default function RootLayout({ children }) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><SiteHeader />{children}<SiteFooter /></body></html>;
}
