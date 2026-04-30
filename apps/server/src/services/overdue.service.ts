/**
 * Overdue Detection Service (SI Billing)
 *
 * Checks milestones for overdue status and sends reminder emails.
 * Run via admin cron endpoint: POST /v1/admin/billing/check-overdue
 *
 * Task: P8.1
 * Refs: SI-BILLING-SPEC.md §4.1
 */
import type { Repositories, FeeMilestoneEntity } from '@revbrain/contract';
import { logger } from '../lib/logger.ts';

const PAYMENT_TERMS_DAYS: Record<string, number> = {
  net_30: 30,
  net_45: 45,
  due_on_receipt: 0,
};

export interface OverdueCheckResult {
  totalChecked: number;
  newlyOverdue: number;
  remindersDay1: number;
  remindersDay7: number;
  remindersDay14: number;
  day30Blocked: number;
}

function getDaysOverdue(milestone: FeeMilestoneEntity, paymentTerms: string): number {
  if (!milestone.invoicedAt) return -1;
  const termsDays = PAYMENT_TERMS_DAYS[paymentTerms] ?? 30;
  const dueDate = new Date(milestone.invoicedAt);
  dueDate.setDate(dueDate.getDate() + termsDays);
  const now = new Date();
  const diffMs = now.getTime() - dueDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export class OverdueService {
  constructor(private repos: Repositories) {}

  async checkAll(): Promise<OverdueCheckResult> {
    const result: OverdueCheckResult = {
      totalChecked: 0,
      newlyOverdue: 0,
      remindersDay1: 0,
      remindersDay7: 0,
      remindersDay14: 0,
      day30Blocked: 0,
    };

    // Get all active agreements
    const allProfiles = await this.repos.partnerProfiles.findMany({ limit: 1000, offset: 0 });

    for (const profile of allProfiles) {
      const agreements = await this.repos.feeAgreements.findByOrgId(profile.organizationId);

      for (const agreement of agreements) {
        if (
          agreement.status === 'cancelled' ||
          agreement.status === 'complete' ||
          agreement.status === 'archived'
        ) {
          continue;
        }

        const milestones = await this.repos.feeMilestones.findByAgreementId(agreement.id);

        for (const milestone of milestones) {
          if (milestone.status !== 'invoiced' && milestone.status !== 'overdue') {
            continue;
          }

          result.totalChecked++;
          const daysOverdue = getDaysOverdue(milestone, agreement.paymentTerms);

          if (daysOverdue < 1) continue;

          // Mark as overdue if not already
          if (milestone.status === 'invoiced') {
            await this.repos.feeMilestones.updateStatus(milestone.id, 'overdue');
            result.newlyOverdue++;
          }

          // Send reminders with deduplication via timestamps
          if (daysOverdue >= 1 && !milestone.overdueReminderSentDay1At) {
            await this.repos.feeMilestones.update(milestone.id, {
              overdueReminderSentDay1At: new Date(),
            });
            result.remindersDay1++;
            logger.info('Overdue day 1 reminder', { milestoneId: milestone.id, daysOverdue });
          }

          if (daysOverdue >= 7 && !milestone.overdueReminderSentDay7At) {
            await this.repos.feeMilestones.update(milestone.id, {
              overdueReminderSentDay7At: new Date(),
            });
            result.remindersDay7++;
            logger.info('Overdue day 7 reminder', { milestoneId: milestone.id, daysOverdue });
          }

          if (daysOverdue >= 14 && !milestone.overdueReminderSentDay14At) {
            await this.repos.feeMilestones.update(milestone.id, {
              overdueReminderSentDay14At: new Date(),
            });
            result.remindersDay14++;
            logger.info('Overdue day 14 escalation', { milestoneId: milestone.id, daysOverdue });
          }

          if (daysOverdue >= 30) {
            result.day30Blocked++;
          }
        }
      }
    }

    return result;
  }

  /**
   * Check if an org has any milestones overdue 30+ days (blocks new project creation).
   */
  async hasDay30Overdue(orgId: string): Promise<boolean> {
    const agreements = await this.repos.feeAgreements.findByOrgId(orgId);

    for (const agreement of agreements) {
      const milestones = await this.repos.feeMilestones.findByAgreementId(agreement.id);
      for (const milestone of milestones) {
        if (milestone.status === 'overdue') {
          const days = getDaysOverdue(milestone, agreement.paymentTerms);
          if (days >= 30) return true;
        }
      }
    }

    return false;
  }
}
