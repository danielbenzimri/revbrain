/**
 * Stripe Client Configuration
 *
 * Initializes the Stripe SDK for server-side operations.
 * Used for creating checkout sessions, managing subscriptions,
 * and verifying webhooks.
 */
import Stripe from 'stripe';
import { getEnv } from './env.ts';
import { logger } from './logger.ts';

let _stripe: Stripe | null = null;

/**
 * Get the Stripe client instance.
 * Lazily initialized on first call.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const secretKey = getEnv('STRIPE_SECRET_KEY');

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is required for billing operations');
  }

  _stripe = new Stripe(secretKey);

  logger.info('Stripe client initialized');
  return _stripe;
}

/**
 * Check if Stripe is configured.
 * Returns false if STRIPE_SECRET_KEY is not set.
 */
export function isStripeConfigured(): boolean {
  return !!getEnv('STRIPE_SECRET_KEY');
}

/**
 * Format cents to currency string.
 * @param cents Amount in cents (e.g., 4999 = $49.99)
 * @param currency ISO currency code (default: USD)
 */
export function formatAmount(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/**
 * Verify Stripe webhook signature using Web Crypto API.
 * This is more reliable in Deno/Edge environments than the Stripe SDK's built-in verification.
 * Throws if signature is invalid.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string
): Promise<Stripe.Event> {
  const webhookSecret = getEnv('STRIPE_WEBHOOK_SECRET');

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is required for webhook verification');
  }

  // Parse the signature header: t=timestamp,v1=signature,v1=signature2,...
  const parts = signature.split(',');
  const timestamp = parts.find((p) => p.startsWith('t='))?.substring(2);
  const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.substring(3));

  if (!timestamp || signatures.length === 0) {
    throw new Error('Invalid signature header format');
  }

  // Check timestamp is within tolerance (5 minutes)
  const timestampSeconds = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSeconds) > 300) {
    throw new Error('Webhook timestamp outside tolerance window');
  }

  // Compute expected signature: HMAC-SHA256(timestamp + "." + payload, secret)
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Check if any of the provided signatures match
  const isValid = signatures.some((sig) => sig === expectedSignature);

  if (!isValid) {
    logger.warn('Webhook signature mismatch', {
      expectedPrefix: expectedSignature.substring(0, 16),
      receivedPrefixes: signatures.map((s) => s.substring(0, 16)),
    });
    throw new Error('Webhook signature verification failed');
  }

  // Parse and return the event
  return JSON.parse(payload) as Stripe.Event;
}
