export interface DemoUser {
  id: string;
  name: string;
  fullName: string;
  email: string;
  role: 'operator' | 'admin' | 'approver' | 'service';
  group: string;
}

export const DEMO_USERS: Record<string, DemoUser> = {
  'joao.silva': {
    id: 'joao.silva',
    name: 'João Silva',
    fullName: 'João Silva',
    email: 'joao.silva@saude.gov',
    role: 'operator',
    group: 'saude',
  },
  'maria.costa': {
    id: 'maria.costa',
    name: 'Maria Costa',
    fullName: 'Maria Costa',
    email: 'm.costa@setic.gov',
    role: 'admin',
    group: 'setic',
  },
  'carlos.mendes': {
    id: 'carlos.mendes',
    name: 'Carlos Mendes',
    fullName: 'Carlos Mendes',
    email: 'c.mendes@transportes.gov',
    role: 'operator',
    group: 'transportes',
  },
  'ana.rodrigues': {
    id: 'ana.rodrigues',
    name: 'Ana Rodrigues',
    fullName: 'Ana Rodrigues',
    email: 'ana.r@fazenda.gov',
    role: 'operator',
    group: 'fazenda',
  },
  'pedro.almeida': {
    id: 'pedro.almeida',
    name: 'Pedro Almeida',
    fullName: 'Pedro Almeida',
    email: 'p.almeida@agricultura.gov',
    role: 'operator',
    group: 'agricultura',
  },
  'lucia.fernandes': {
    id: 'lucia.fernandes',
    name: 'Lúcia Fernandes',
    fullName: 'Lúcia Fernandes',
    email: 'l.fernandes@seguranca.gov',
    role: 'approver',
    group: 'seguranca',
  },
  'rafael.souza': {
    id: 'rafael.souza',
    name: 'Rafael Souza',
    fullName: 'Rafael Souza',
    email: 'r.souza@educacao.gov',
    role: 'operator',
    group: 'educacao',
  },
  'platform.bot': {
    id: 'platform.bot',
    name: 'Platform Service',
    fullName: 'Platform Service',
    email: 'platform@setic.gov',
    role: 'service',
    group: 'setic',
  },
};
