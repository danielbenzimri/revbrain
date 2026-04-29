import { describe, it, expect } from 'vitest';
import {
  MOCK_IDS,
  SEED_PLANS,
  SEED_ORGANIZATIONS,
  SEED_USERS,
  SEED_PROJECTS,
  SEED_AUDIT_LOGS,
  SEED_TICKETS,
  SEED_TICKET_MESSAGES,
  SEED_COUPONS,
  SEED_TENANT_OVERRIDES,
} from './index.ts';
import {
  orgTypeSchema,
  ORG_TYPES,
  partnerTierSchema,
  PARTNER_TIERS,
  feeAgreementStatusSchema,
  FEE_AGREEMENT_STATUSES,
  paymentTermsSchema,
  PAYMENT_TERMS,
  assessmentCloseReasonSchema,
  createFeeAgreementSchema,
} from '@revbrain/contract';

describe('Seed Data Package', () => {
  describe('MOCK_IDS', () => {
    it('exports all ID categories', () => {
      expect(MOCK_IDS.PLAN_STARTER).toBeDefined();
      expect(MOCK_IDS.ORG_ACME).toBeDefined();
      expect(MOCK_IDS.USER_SYSTEM_ADMIN).toBeDefined();
      expect(MOCK_IDS.PROJECT_Q1_MIGRATION).toBeDefined();
      expect(MOCK_IDS.TICKET_1).toBeDefined();
      expect(MOCK_IDS.COUPON_ACTIVE_PERCENT).toBeDefined();
      expect(MOCK_IDS.OVERRIDE_1).toBeDefined();
    });

    it('has deterministic UUIDs (v4 format)', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      for (const [key, value] of Object.entries(MOCK_IDS)) {
        expect(value, `MOCK_IDS.${key}`).toMatch(uuidRegex);
      }
    });

    it('has no duplicate IDs', () => {
      const values = Object.values(MOCK_IDS);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });
  });

  describe('Entity counts', () => {
    it('has 3 plans', () => expect(SEED_PLANS).toHaveLength(3));
    it('has 2 organizations', () => expect(SEED_ORGANIZATIONS).toHaveLength(2));
    it('has 8 users', () => expect(SEED_USERS).toHaveLength(8));
    it('has 4 projects', () => expect(SEED_PROJECTS).toHaveLength(4));
    it('has 10 audit logs', () => expect(SEED_AUDIT_LOGS).toHaveLength(10));
    it('has 6 tickets', () => expect(SEED_TICKETS).toHaveLength(6));
    it('has 11 ticket messages', () => expect(SEED_TICKET_MESSAGES).toHaveLength(11));
    it('has 4 coupons', () => expect(SEED_COUPONS).toHaveLength(4));
    it('has 2 tenant overrides', () => expect(SEED_TENANT_OVERRIDES).toHaveLength(2));
  });

  describe('Referential integrity', () => {
    const planIds = new Set(SEED_PLANS.map((p) => p.id));
    const orgIds = new Set(SEED_ORGANIZATIONS.map((o) => o.id));
    const userIds = new Set(SEED_USERS.map((u) => u.id));
    const ticketIds = new Set(SEED_TICKETS.map((t) => t.id));

    it('all org planIds reference existing plans', () => {
      for (const org of SEED_ORGANIZATIONS) {
        if (org.planId) {
          expect(planIds.has(org.planId), `org ${org.name} references planId ${org.planId}`).toBe(
            true
          );
        }
      }
    });

    it('all user organizationIds reference existing orgs', () => {
      for (const user of SEED_USERS) {
        expect(
          orgIds.has(user.organizationId),
          `user ${user.email} references orgId ${user.organizationId}`
        ).toBe(true);
      }
    });

    it('all user invitedBy references existing users or is null', () => {
      for (const user of SEED_USERS) {
        if (user.invitedBy) {
          expect(
            userIds.has(user.invitedBy),
            `user ${user.email} invitedBy ${user.invitedBy}`
          ).toBe(true);
        }
      }
    });

    it('all project ownerIds reference existing users', () => {
      for (const project of SEED_PROJECTS) {
        expect(
          userIds.has(project.ownerId),
          `project ${project.name} ownerId ${project.ownerId}`
        ).toBe(true);
      }
    });

    it('all project organizationIds reference existing orgs', () => {
      for (const project of SEED_PROJECTS) {
        expect(
          orgIds.has(project.organizationId),
          `project ${project.name} orgId ${project.organizationId}`
        ).toBe(true);
      }
    });

    it('all audit log userIds reference existing users', () => {
      for (const log of SEED_AUDIT_LOGS) {
        if (log.userId) {
          expect(userIds.has(log.userId), `audit log userId ${log.userId}`).toBe(true);
        }
      }
    });

    it('all audit log organizationIds reference existing orgs', () => {
      for (const log of SEED_AUDIT_LOGS) {
        if (log.organizationId) {
          expect(orgIds.has(log.organizationId), `audit log orgId ${log.organizationId}`).toBe(
            true
          );
        }
      }
    });

    it('all ticket userIds reference existing users', () => {
      for (const ticket of SEED_TICKETS) {
        expect(
          userIds.has(ticket.userId),
          `ticket ${ticket.ticketNumber} userId ${ticket.userId}`
        ).toBe(true);
      }
    });

    it('all ticket organizationIds reference existing orgs', () => {
      for (const ticket of SEED_TICKETS) {
        expect(
          orgIds.has(ticket.organizationId),
          `ticket ${ticket.ticketNumber} orgId ${ticket.organizationId}`
        ).toBe(true);
      }
    });

    it('all ticket messages reference existing tickets', () => {
      for (const msg of SEED_TICKET_MESSAGES) {
        expect(
          ticketIds.has(msg.ticketId),
          `message ${msg.id} references ticketId ${msg.ticketId}`
        ).toBe(true);
      }
    });

    it('all override organizationIds reference existing orgs', () => {
      for (const override of SEED_TENANT_OVERRIDES) {
        expect(
          orgIds.has(override.organizationId),
          `override ${override.id} orgId ${override.organizationId}`
        ).toBe(true);
      }
    });

    it('all override grantedBy references existing users', () => {
      for (const override of SEED_TENANT_OVERRIDES) {
        expect(
          userIds.has(override.grantedBy),
          `override ${override.id} grantedBy ${override.grantedBy}`
        ).toBe(true);
      }
    });

    it('all coupon applicablePlanIds reference existing plans', () => {
      for (const coupon of SEED_COUPONS) {
        for (const pid of coupon.applicablePlanIds) {
          expect(planIds.has(pid), `coupon ${coupon.code} references planId ${pid}`).toBe(true);
        }
      }
    });
  });

  describe('Business rules', () => {
    it('all 5 user roles are represented', () => {
      const roles = new Set(SEED_USERS.map((u) => u.role));
      expect(roles).toContain('system_admin');
      expect(roles).toContain('org_owner');
      expect(roles).toContain('admin');
      expect(roles).toContain('operator');
      expect(roles).toContain('reviewer');
    });

    it('all ticket statuses are covered', () => {
      const statuses = new Set(SEED_TICKETS.map((t) => t.status));
      expect(statuses).toContain('open');
      expect(statuses).toContain('in_progress');
      expect(statuses).toContain('waiting_customer');
      expect(statuses).toContain('resolved');
      expect(statuses).toContain('closed');
    });

    it('has at least one pending (inactive) user', () => {
      const pending = SEED_USERS.filter((u) => !u.isActive);
      expect(pending.length).toBeGreaterThanOrEqual(1);
    });

    it('every ticket has at least one message', () => {
      for (const ticket of SEED_TICKETS) {
        const messages = SEED_TICKET_MESSAGES.filter((m) => m.ticketId === ticket.id);
        expect(
          messages.length,
          `ticket ${ticket.ticketNumber} has no messages`
        ).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('OrgType validation (P1.1)', () => {
    it('orgTypeSchema accepts valid org types', () => {
      for (const t of ORG_TYPES) {
        expect(orgTypeSchema.safeParse(t).success).toBe(true);
      }
    });

    it('orgTypeSchema rejects invalid org types', () => {
      expect(orgTypeSchema.safeParse('invalid').success).toBe(false);
      expect(orgTypeSchema.safeParse('').success).toBe(false);
      expect(orgTypeSchema.safeParse(123).success).toBe(false);
      expect(orgTypeSchema.safeParse(null).success).toBe(false);
    });

    it('all seed organizations have valid orgType', () => {
      for (const org of SEED_ORGANIZATIONS) {
        expect(
          orgTypeSchema.safeParse(org.orgType).success,
          `org ${org.name} has invalid orgType: ${org.orgType}`
        ).toBe(true);
      }
    });

    it('all seed organizations have billingContactEmail field', () => {
      for (const org of SEED_ORGANIZATIONS) {
        expect(org).toHaveProperty('billingContactEmail');
      }
    });
  });

  describe('PartnerTier validation (P1.2)', () => {
    it('partnerTierSchema accepts valid tiers', () => {
      for (const t of PARTNER_TIERS) {
        expect(partnerTierSchema.safeParse(t).success).toBe(true);
      }
    });

    it('partnerTierSchema rejects invalid tiers', () => {
      expect(partnerTierSchema.safeParse('bronze').success).toBe(false);
      expect(partnerTierSchema.safeParse('').success).toBe(false);
      expect(partnerTierSchema.safeParse(123).success).toBe(false);
      expect(partnerTierSchema.safeParse(null).success).toBe(false);
    });

    it('PARTNER_TIERS has exactly 4 values', () => {
      expect(PARTNER_TIERS).toHaveLength(4);
      expect(PARTNER_TIERS).toContain('standard');
      expect(PARTNER_TIERS).toContain('silver');
      expect(PARTNER_TIERS).toContain('gold');
      expect(PARTNER_TIERS).toContain('platinum');
    });
  });

  describe('FeeAgreement validation (P1.3)', () => {
    it('feeAgreementStatusSchema accepts all 8 valid statuses', () => {
      expect(FEE_AGREEMENT_STATUSES).toHaveLength(8);
      for (const s of FEE_AGREEMENT_STATUSES) {
        expect(feeAgreementStatusSchema.safeParse(s).success).toBe(true);
      }
    });

    it('feeAgreementStatusSchema rejects invalid statuses', () => {
      expect(feeAgreementStatusSchema.safeParse('active').success).toBe(false);
      expect(feeAgreementStatusSchema.safeParse('pending').success).toBe(false);
    });

    it('paymentTermsSchema accepts valid values and rejects invalid', () => {
      for (const t of PAYMENT_TERMS) {
        expect(paymentTermsSchema.safeParse(t).success).toBe(true);
      }
      expect(paymentTermsSchema.safeParse('net_45').success).toBe(false);
      expect(paymentTermsSchema.safeParse(30).success).toBe(false);
    });

    it('assessmentCloseReasonSchema accepts valid values', () => {
      expect(assessmentCloseReasonSchema.safeParse('budget').success).toBe(true);
      expect(assessmentCloseReasonSchema.safeParse('competitor').success).toBe(true);
      expect(assessmentCloseReasonSchema.safeParse('invalid_reason').success).toBe(false);
    });

    it('createFeeAgreementSchema rejects cap < assessment_fee', () => {
      const result = createFeeAgreementSchema.safeParse({
        projectId: '00000000-0000-4000-8000-000000000001',
        assessmentFee: 1500000, // $15K
        capAmount: 1000000, // $10K — less than assessment fee
      });
      expect(result.success).toBe(false);
    });

    it('createFeeAgreementSchema accepts cap >= assessment_fee', () => {
      const result = createFeeAgreementSchema.safeParse({
        projectId: '00000000-0000-4000-8000-000000000001',
        assessmentFee: 1500000,
        capAmount: 1500000, // equal
      });
      expect(result.success).toBe(true);
    });

    it('createFeeAgreementSchema accepts null cap', () => {
      const result = createFeeAgreementSchema.safeParse({
        projectId: '00000000-0000-4000-8000-000000000001',
        assessmentFee: 1500000,
        capAmount: null,
      });
      expect(result.success).toBe(true);
    });

    it('createFeeAgreementSchema rejects assessment_fee <= 0', () => {
      const result = createFeeAgreementSchema.safeParse({
        projectId: '00000000-0000-4000-8000-000000000001',
        assessmentFee: 0,
      });
      expect(result.success).toBe(false);

      const result2 = createFeeAgreementSchema.safeParse({
        projectId: '00000000-0000-4000-8000-000000000001',
        assessmentFee: -100,
      });
      expect(result2.success).toBe(false);
    });
  });
});
