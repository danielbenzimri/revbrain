/**
 * Billing calculation utilities
 */

/**
 * Calculate savings percentage when paying yearly vs monthly
 * @param monthlyPrice - Monthly plan price in cents
 * @param yearlyPrice - Yearly plan price in cents
 * @returns Savings percentage (0-100), or null if cannot calculate
 */
export function calculateYearlySavings(
  monthlyPrice: number | undefined,
  yearlyPrice: number | undefined
): number | null {
  if (!monthlyPrice || !yearlyPrice || monthlyPrice <= 0) {
    return null;
  }

  const yearlyEquivalent = monthlyPrice * 12;
  const savings = ((yearlyEquivalent - yearlyPrice) / yearlyEquivalent) * 100;

  return Math.round(savings);
}
