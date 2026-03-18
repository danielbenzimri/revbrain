/**
 * Grace seats - allow slight overage before hard blocking
 */
const GRACE_SEATS = 1;

/**
 * Seat availability check result
 */
export interface SeatAvailability {
  canInvite: boolean;
  warning?: string;
  seatsRemaining: number;
}

/**
 * Minimal org type required for seat checking
 */
export interface OrgWithSeats {
  seatLimit: number;
  seatUsed: number;
}

/**
 * Check if an organization can invite more users
 *
 * Implements a grace period strategy:
 * - If well under limit: allow with no warning
 * - If approaching limit: allow with warning
 * - If at limit: allow with urgent warning (grace period)
 * - If beyond grace: hard block
 *
 * This follows industry best practices (Slack, Notion, Figma)
 */
export function checkSeatAvailability(org: OrgWithSeats): SeatAvailability {
  const remaining = org.seatLimit - org.seatUsed;

  // Well under limit - no issues
  if (remaining > GRACE_SEATS) {
    return {
      canInvite: true,
      seatsRemaining: remaining,
    };
  }

  // Approaching limit - soft warning
  if (remaining > 0) {
    return {
      canInvite: true,
      warning: `Only ${remaining} seat(s) remaining. Consider upgrading your plan.`,
      seatsRemaining: remaining,
    };
  }

  // At or slightly over limit - grace period with urgent warning
  if (remaining > -GRACE_SEATS) {
    return {
      canInvite: true,
      warning: `⚠️ Seat limit exceeded. Please upgrade within 7 days to avoid service interruption.`,
      seatsRemaining: remaining,
    };
  }

  // Beyond grace period - hard block
  return {
    canInvite: false,
    warning: 'Seat limit reached. Please upgrade your plan to invite more users.',
    seatsRemaining: remaining,
  };
}
