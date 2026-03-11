import { createRoot } from 'react-dom/client';
import { AppShell } from './shared/AppShell';
import { resolveRoleFromPath } from './shared/routing';
import '../public/css/index.css';

const rootElement = document.getElementById('app');
if (!rootElement) {
  throw new Error('Missing #app root element');
}

const role = resolveRoleFromPath(window.location.pathname);
createRoot(rootElement).render(<AppShell role={role} />);
