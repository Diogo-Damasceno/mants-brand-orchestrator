import type { PlanLimits, PlanTier } from '@mants/shared-types';

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceBRLMonthly: number;
  limits: PlanLimits;
  /** Texto curto para a página de preços. */
  highlight?: string;
  features: string[];
}

/** Catálogo de planos configurável. Não cobra por tokens. */
export const PLANS: PlanDefinition[] = [
  {
    tier: 'basic',
    name: 'Básico',
    priceBRLMonthly: 49,
    highlight: 'Para começar a organizar sua marca.',
    features: [
      '1 Brand Kit',
      '1 usuário',
      'Biblioteca de ativos limitada',
      'Templates essenciais',
      'Limite mensal de Pacotes Criativos',
      'Histórico reduzido',
    ],
    limits: {
      brandKits: 1,
      users: 1,
      clients: 3,
      storageBytes: 1 * 1024 * 1024 * 1024,
      creativePackagesPerMonth: 10,
      historyDays: 30,
      customTemplates: false,
      versioning: false,
      whiteLabel: false,
      approvals: false,
    },
  },
  {
    tier: 'professional',
    name: 'Profissional',
    priceBRLMonthly: 149,
    highlight: 'Para times em crescimento.',
    features: [
      'Múltiplos Brand Kits',
      'Mais usuários',
      'Mais armazenamento',
      'Todos os templates',
      'Aprovações',
      'Histórico completo',
      'Versionamento',
    ],
    limits: {
      brandKits: 10,
      users: 10,
      clients: 30,
      storageBytes: 20 * 1024 * 1024 * 1024,
      creativePackagesPerMonth: 200,
      historyDays: 365,
      customTemplates: false,
      versioning: true,
      whiteLabel: false,
      approvals: true,
    },
  },
  {
    tier: 'agency',
    name: 'Agência',
    priceBRLMonthly: 399,
    highlight: 'Para agências com múltiplos clientes.',
    features: [
      'Múltiplos clientes',
      'Equipe e permissões',
      'White-label',
      'Templates personalizados',
      'Relatórios',
      'Mais armazenamento',
      'Suporte prioritário',
    ],
    limits: {
      brandKits: 100,
      users: 50,
      clients: 500,
      storageBytes: 200 * 1024 * 1024 * 1024,
      creativePackagesPerMonth: 2000,
      historyDays: 730,
      customTemplates: true,
      versioning: true,
      whiteLabel: true,
      approvals: true,
    },
  },
];

export function getPlan(tier: PlanTier): PlanDefinition {
  const p = PLANS.find((x) => x.tier === tier);
  if (!p) return PLANS[0]!;
  return p;
}

export interface PlanUsage {
  brandKits: number;
  users: number;
  clients: number;
  storageBytes: number;
  packagesThisMonth: number;
  retentionDays: number;
}

/** Lança erro se o uso exceder os limites do plano. Usado no backend para isolamento e controle. */
export function enforcePlanLimits(plan: PlanDefinition, usage: PlanUsage): void {
  const L = plan.limits;
  if (usage.brandKits > L.brandKits) throw new Error(`Limite de Brand Kits (${L.brandKits}) excedido.`);
  if (usage.users > L.users) throw new Error(`Limite de usuários (${L.users}) excedido.`);
  if (usage.clients > L.clients) throw new Error(`Limite de clientes (${L.clients}) excedido.`);
  if (usage.storageBytes > L.storageBytes) throw new Error(`Limite de armazenamento excedido.`);
  if (usage.packagesThisMonth > L.creativePackagesPerMonth)
    throw new Error(`Limite mensal de Pacotes Criativos (${L.creativePackagesPerMonth}) excedido.`);
  if (usage.retentionDays > L.historyDays)
    throw new Error(`Retenção (${usage.retentionDays} dias) excede o plano (${L.historyDays} dias).`);
}

export interface SubscriptionState {
  organizationId: string;
  tier: PlanTier;
  status: 'active' | 'canceled' | 'past_due';
  currentPeriodEnd: string;
}

export interface BillingProvider {
  readonly name: string;
  createSubscription(organizationId: string, tier: PlanTier): Promise<SubscriptionState>;
  cancelSubscription(organizationId: string): Promise<SubscriptionState>;
  getSubscription(organizationId: string): Promise<SubscriptionState | null>;
}

/** Provedor mock para desenvolvimento. Não armazena cartões nem chama serviços externos. */
export class MockBillingProvider implements BillingProvider {
  readonly name = 'mock';
  private store = new Map<string, SubscriptionState>();

  async createSubscription(organizationId: string, tier: PlanTier): Promise<SubscriptionState> {
    const state: SubscriptionState = {
      organizationId,
      tier,
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000).toISOString(),
    };
    this.store.set(organizationId, state);
    return state;
  }

  async cancelSubscription(organizationId: string): Promise<SubscriptionState> {
    const existing = this.store.get(organizationId);
    const state: SubscriptionState = {
      organizationId,
      tier: existing?.tier ?? 'basic',
      status: 'canceled',
      currentPeriodEnd: existing?.currentPeriodEnd ?? new Date().toISOString(),
    };
    this.store.set(organizationId, state);
    return state;
  }

  async getSubscription(organizationId: string): Promise<SubscriptionState | null> {
    return this.store.get(organizationId) ?? null;
  }
}

export function createBillingProvider(name: string): BillingProvider {
  switch (name) {
    case 'mock':
      return new MockBillingProvider();
    case 'mercadopago':
      // Preparação: implementar adapter Mercado Pago (fora do MVP).
      return new MockBillingProvider();
    case 'stripe':
      // Preparação: implementar adapter Stripe (fora do MVP).
      return new MockBillingProvider();
    default:
      return new MockBillingProvider();
  }
}
