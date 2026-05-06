// Composition root for the ITSM portal demo.
//
// Wires the in-app router, the role switch, the toast slot, and the user's
// UI tweaks into a single shell (UtilityBand + Sidebar + Topbar + main +
// ToastStack). The page slot is selected by `route`. Pages that aren't
// implemented yet (Tasks 7–14) render a `<div className="page-placeholder">`
// so the App can be exercised end-to-end before each page lands.

import { useEffect, useMemo, useState } from 'react';
import { Approvals } from './pages/Approvals';
import { Catalog } from './pages/Catalog';
import { Dashboard } from './pages/Dashboard';
import { NewRequest } from './pages/NewRequest';
import { RequestDetail } from './pages/RequestDetail';
import { RequestsList } from './pages/RequestsList';
import { Forms as AdminForms } from './pages/admin/Forms';
import { Users as AdminUsers } from './pages/admin/Users';
import { Sidebar } from './shell/Sidebar';
import { Topbar } from './shell/Topbar';
import { UtilityBand } from './shell/UtilityBand';
import { ToastStack, type Toast } from './shell/ToastStack';
import { useGdfData } from './state/dataContext';
import { useTweaks } from './tweaks/useTweaks';
import { TweaksPanel } from './tweaks/TweaksPanel';
import { useRouter } from './router';
import type { Role, Tweaks, User } from './types';

const DEFAULT_TWEAKS: Tweaks = {
  density: 'compact',
  theme: 'light',
  sidebarCollapsed: false,
  pipelineSpeed: 1,
  showDemoBanner: true,
};

const FALLBACK_OPERATOR: User = {
  id: 'demo-operator',
  name: 'João Silva',
  fullName: 'João Silva',
  email: 'joao.silva@saude.gov',
  role: 'operator',
  group: 'saude',
};

const FALLBACK_ADMIN: User = {
  id: 'demo-admin',
  name: 'Maria Costa',
  fullName: 'Maria Costa',
  email: 'm.costa@setic.gov',
  role: 'admin',
  group: 'setic',
};

function pickUser(users: User[], role: Role): User {
  if (role === 'admin') {
    return (
      users.find(
        (u) => u.username === 'maria.costa' || u.username === 'm.costa',
      ) ??
      users.find((u) => u.role === 'admin') ??
      FALLBACK_ADMIN
    );
  }
  return (
    users.find((u) => u.username === 'joao.silva') ??
    users.find((u) => u.role === 'operator') ??
    FALLBACK_OPERATOR
  );
}

function App() {
  const { route, params, navigate } = useRouter();
  const [role, setRole] = useState<Role>('operator');
  const [toast, setToast] = useState<Toast | null>(null);
  const [tweaks, setTweaks] = useTweaks(DEFAULT_TWEAKS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const data = useGdfData();

  const user = useMemo(() => pickUser(data.users, role), [data.users, role]);

  // Role-route guard: operators may not view admin/approval routes.
  useEffect(() => {
    if (
      role === 'operator' &&
      (route === 'approvals' ||
        route === 'admin-forms' ||
        route === 'admin-users')
    ) {
      navigate('home');
    }
  }, [role, route, navigate]);

  // Apply theme as a `data-theme` attribute on <html>. Persistent — no cleanup.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme);
  }, [tweaks.theme]);

  const crumbs = useMemo<string[]>(() => {
    switch (route) {
      case 'home':
        return ['Home'];
      case 'catalog':
        return ['Service Catalog'];
      case 'new-request': {
        const form = data.forms.find((f) => f.id === params.formId);
        const label = form?.name ?? params.formId ?? 'New request';
        return ['Service Catalog', label];
      }
      case 'requests':
        return [role === 'admin' ? 'All requests' : 'My requests'];
      case 'request-detail':
        return [
          role === 'admin' ? 'All requests' : 'My requests',
          params.id ?? 'Request',
        ];
      case 'approvals':
        return ['Approvals'];
      case 'admin-forms':
        return ['Forms'];
      case 'admin-users':
        return ['Users'];
      default: {
        const _exhaustive: never = route;
        return [_exhaustive];
      }
    }
  }, [route, params.formId, params.id, data.forms, role]);

  const pageElement =
    route === 'home' ? (
      <Dashboard
        role={role}
        navigate={navigate}
        user={user}
        setToast={setToast}
      />
    ) : route === 'catalog' ? (
      <Catalog navigate={navigate} />
    ) : route === 'new-request' ? (
      <NewRequest
        formId={params.formId}
        navigate={navigate}
        setToast={setToast}
        user={user}
        role={role}
      />
    ) : route === 'requests' ? (
      <RequestsList role={role} user={user} navigate={navigate} />
    ) : route === 'request-detail' ? (
      <RequestDetail id={params.id} navigate={navigate} tweaks={tweaks} />
    ) : route === 'approvals' ? (
      <Approvals
        role={role}
        user={user}
        navigate={navigate}
        setToast={setToast}
      />
    ) : route === 'admin-forms' ? (
      <AdminForms navigate={navigate} setToast={setToast} />
    ) : route === 'admin-users' ? (
      <AdminUsers navigate={navigate} setToast={setToast} />
    ) : (
      <div className="page-placeholder">{route}</div>
    );

  const appClass = tweaks.showDemoBanner ? 'app with-banner' : 'app';

  return (
    <div className={appClass} data-density={tweaks.density}>
      <UtilityBand />
      <Sidebar
        route={route}
        navigate={navigate}
        role={role}
        collapsed={tweaks.sidebarCollapsed}
      />
      <Topbar
        crumbs={crumbs}
        role={role}
        setRole={setRole}
        user={user}
        onNotify={() =>
          setToast({
            id: `notify-${Date.now()}`,
            kind: 'info',
            title: 'Notifications',
            body: 'No new notifications.',
          })
        }
      />
      <main className="main">{pageElement}</main>
      <ToastStack toast={toast} onDismiss={() => setToast(null)} />
      <button
        type="button"
        className="btn"
        onClick={() => setTweaksOpen((v) => !v)}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 250,
          boxShadow: '0 2px 8px rgba(15, 38, 77, 0.12)',
        }}
      >
        Tweaks
      </button>
      <TweaksPanel
        open={tweaksOpen}
        tweaks={tweaks}
        setTweaks={setTweaks}
        onClose={() => setTweaksOpen(false)}
        role={role}
        setRole={setRole}
        navigate={navigate}
      />
    </div>
  );
}

export default App;
