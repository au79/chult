import { createRoot } from 'react-dom/client';
import { AppShell } from './shared/AppShell';
import '../public/css/index.css';

function resolveRoleFromPath(pathname: string): 'dm' | 'player' {
  return pathname.endsWith('/dm.html') || pathname === '/dm.html'
    ? 'dm'
    : 'player';
}

const rootElement = document.getElementById('app');
if (!rootElement) {
  throw new Error('Missing #app root element');
}

const role = resolveRoleFromPath(window.location.pathname);
createRoot(rootElement).render(<AppShell role={role} />);
