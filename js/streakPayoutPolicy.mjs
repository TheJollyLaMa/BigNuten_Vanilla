export const LEGACY_STREAK_PAYOUT_POLICY_VERSION = 1;
export const RANKED_TIE_PAYOUT_POLICY_VERSION = 2;

export async function streakPayoutPolicyVersion(contract) {
  if (typeof contract?.streakPayoutPolicyVersion !== 'function') {
    return LEGACY_STREAK_PAYOUT_POLICY_VERSION;
  }
  try {
    const value = Number(await contract.streakPayoutPolicyVersion());
    return Number.isSafeInteger(value) && value >= 1
      ? value
      : LEGACY_STREAK_PAYOUT_POLICY_VERSION;
  } catch (error) {
    if (error?.code === 'CALL_EXCEPTION' || error?.code === 'BAD_DATA') {
      return LEGACY_STREAK_PAYOUT_POLICY_VERSION;
    }
    throw error;
  }
}

export function usesRankedTiePayouts(version) {
  return Number(version) >= RANKED_TIE_PAYOUT_POLICY_VERSION;
}
