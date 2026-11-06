import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { manifest } from '../content/manifest';

const NAVIGATION = [
  { label: 'Projects', href: '/#projects' },
  { label: 'Approach', href: '/#approach' },
  { label: 'Contact', href: '/#contact' },
] as const;

const MOBILE_QUERY = '(max-width: 767px)';

function subscribeToMobile(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const readMobile = () => window.matchMedia(MOBILE_QUERY).matches;
const readServerMobile = () => false;

const subscribeToHydration = () => () => {};
const readHydrated = () => true;
const readServerHydrated = () => false;

function focusDestination(href: string) {
  const hash = href.split('#')[1];
  if (!hash) return;
  requestAnimationFrame(() => {
    document.getElementById(hash)?.focus({ preventScroll: true });
  });
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, readHydrated, readServerHydrated);
  const mobile = useSyncExternalStore(subscribeToMobile, readMobile, readServerMobile);
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const showToggle = hydrated && mobile;
  const expanded = showToggle && open;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      setOpen(false);
      toggleRef.current?.focus();
    }
  }

  function handleNavigate(href: string) {
    if (!mobile) return;
    setOpen(false);
    focusDestination(href);
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="site-header" onKeyDown={handleKeyDown}>
        <nav className="site-header-inner" aria-label="Primary">
          <div className="site-header-bar">
            <a className="brand" href="/" aria-label="Denver.dev home">
              <span>Denver</span>
              <span className="brand-mark" aria-hidden="true">
                .dev
              </span>
            </a>
            {showToggle && (
              <button
                ref={toggleRef}
                type="button"
                className="nav-toggle"
                aria-expanded={expanded}
                aria-controls="primary-navigation"
                aria-label="Navigation menu"
                onClick={() => setOpen((value) => !value)}
              >
                <span className="nav-toggle-glyph" aria-hidden="true">
                  {expanded ? '×' : '≡'}
                </span>
              </button>
            )}
          </div>
          <ul
            id="primary-navigation"
            className="nav-list"
            data-open={mobile && !open ? 'false' : 'true'}
          >
            {NAVIGATION.map((item) => (
              <li key={item.href}>
                <a href={item.href} onClick={() => handleNavigate(item.href)}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="site-main" tabIndex={-1}>
        <div className="page-container">{children}</div>
      </main>
      <footer id="contact" className="site-footer">
        <div className="page-container site-footer-inner">
          <div>
            <h2>Contact</h2>
            <p>{manifest.profile.name}</p>
          </div>
          <div className="footer-links">
            <a href={`mailto:${manifest.profile.email}`}>{manifest.profile.email}</a>
            <a href={manifest.profile.github}>GitHub profile</a>
          </div>
        </div>
      </footer>
    </>
  );
}
