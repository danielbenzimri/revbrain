import type { PlanEntity } from '@revbrain/contract';
import { MOCK_IDS } from './constants.ts';
import { daysAgo } from './helpers.ts';

export const SEED_PLANS: readonly PlanEntity[] = [
  {
    id: MOCK_IDS.PLAN_STARTER,
    name: 'Starter',
    code: 'starter',
    description: 'For small teams getting started with RevBrain',
    price: 0,
    currency: 'USD',
    interval: 'month',
    yearlyDiscountPercent: 0,
    limits: { maxUsers: 5, maxProjects: 3, storageGB: 5 },
    features: {
      aiLevel: 'basic',
      modules: ['cpq_migration'],
      customBranding: false,
      sso: false,
    },
    isActive: true,
    isPublic: true,
    stripeProductId: null,
    stripePriceId: null,
    createdAt: daysAgo(90),
    updatedAt: daysAgo(90),
  },
  {
    id: MOCK_IDS.PLAN_PRO,
    name: 'Pro',
    code: 'pro',
    description: 'For growing teams with complex migration needs',
    price: 9900, // $99/mo in cents
    currency: 'USD',
    interval: 'month',
    yearlyDiscountPercent: 20,
    limits: { maxUsers: 25, maxProjects: 0, storageGB: 50 },
    features: {
      aiLevel: 'advanced',
      modules: [
        'cpq_migration',
        'data_validation',
        'advanced_reporting',
        'api_access',
        'bulk_operations',
      ],
      customBranding: false,
      sso: false,
    },
    isActive: true,
    isPublic: true,
    stripeProductId: null,
    stripePriceId: null,
    createdAt: daysAgo(90),
    updatedAt: daysAgo(30),
  },
  {
    id: MOCK_IDS.PLAN_ENTERPRISE,
    name: 'Enterprise',
    code: 'enterprise',
    description: 'For large organizations requiring scale and compliance',
    price: 49900, // $499/mo in cents
    currency: 'USD',
    interval: 'month',
    yearlyDiscountPercent: 25,
    limits: { maxUsers: 0, maxProjects: 0, storageGB: 500 },
    features: {
      aiLevel: 'full',
      modules: [
        'cpq_migration',
        'data_validation',
        'advanced_reporting',
        'api_access',
        'bulk_operations',
        'audit_trail',
        'webhook_support',
      ],
      customBranding: false, // Not yet implemented — see SYSTEM-ADMIN-AUDIT.md Section 21
      sso: true,
    },
    isActive: true,
    isPublic: false,
    stripeProductId: null,
    stripePriceId: null,
    createdAt: daysAgo(90),
    updatedAt: daysAgo(15),
  },
] as const;
