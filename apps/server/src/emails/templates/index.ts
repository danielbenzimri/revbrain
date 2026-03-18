/**
 * Email template registry.
 * Maps template names to their renderer functions.
 */

// Account & Onboarding
export { renderWelcomeEmail, type WelcomeEmailData } from './welcome.ts';

// Billing & Payments
export { renderPaymentReceiptEmail, type PaymentReceiptEmailData } from './payment-receipt.ts';
export { renderPaymentFailedEmail, type PaymentFailedEmailData } from './payment-failed.ts';
export {
  renderSubscriptionChangedEmail,
  type SubscriptionChangedEmailData,
} from './subscription-changed.ts';
export { renderTrialEndingEmail, type TrialEndingEmailData } from './trial-ending.ts';
export { renderTrialEndedEmail, type TrialEndedEmailData } from './trial-ended.ts';

// Refunds
export {
  renderRefundConfirmationEmail,
  type RefundConfirmationEmailData,
} from './refund-confirmation.ts';

// Leads & Sales
export {
  renderLeadNotificationEmail,
  type LeadNotificationEmailData,
} from './lead-notification.ts';
export {
  renderLeadConfirmationEmail,
  type LeadConfirmationEmailData,
} from './lead-confirmation.ts';
