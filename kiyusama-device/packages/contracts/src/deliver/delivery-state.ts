export type DeliveryState =
  | 'ROUTED'
  | 'DEDUPE_CHECKED'
  | 'AUTHORIZED'
  | 'DELIVERY_ATTEMPTED'
  | 'ACKNOWLEDGED'
  | 'VERIFIED'
  | 'RECORDED'
  | 'DUPLICATE'
  | 'EXPIRED'
  | 'SPOOF_DETECTED'
  | 'AUTHORITY_DENIED'
  | 'DELIVERY_FAILED'
  | 'VERIFY_FAILED'
  | 'TIMEOUT'
  | 'FROZEN';

export interface DeliveryTransitionContext {
  readonly independent_verification_evidence: boolean;
}

const TERMINAL_STATES = new Set<DeliveryState>([
  'RECORDED', 'DUPLICATE', 'EXPIRED', 'SPOOF_DETECTED', 'AUTHORITY_DENIED',
  'DELIVERY_FAILED', 'VERIFY_FAILED', 'TIMEOUT', 'FROZEN',
]);

const NORMAL_NEXT: Readonly<Partial<Record<DeliveryState, readonly DeliveryState[]>>> = {
  ROUTED: ['DEDUPE_CHECKED'],
  DEDUPE_CHECKED: ['AUTHORIZED'],
  AUTHORIZED: ['DELIVERY_ATTEMPTED'],
  DELIVERY_ATTEMPTED: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['VERIFIED'],
  VERIFIED: ['RECORDED'],
};

const FAILURE_FROM: Readonly<Partial<Record<DeliveryState, readonly DeliveryState[]>>> = {
  ROUTED: ['EXPIRED', 'FROZEN'],
  DEDUPE_CHECKED: ['DUPLICATE', 'EXPIRED', 'FROZEN'],
  AUTHORIZED: ['AUTHORITY_DENIED', 'EXPIRED', 'TIMEOUT', 'FROZEN'],
  DELIVERY_ATTEMPTED: ['DELIVERY_FAILED', 'TIMEOUT', 'FROZEN'],
  ACKNOWLEDGED: ['VERIFY_FAILED', 'TIMEOUT', 'FROZEN'],
  VERIFIED: ['FROZEN'],
};

export const canTransitionDeliveryState = (
  from: DeliveryState,
  to: DeliveryState,
  context: DeliveryTransitionContext,
): boolean => {
  if (TERMINAL_STATES.has(from)) return false;

  const normalAllowed = NORMAL_NEXT[from]?.includes(to) ?? false;
  const failureAllowed = FAILURE_FROM[from]?.includes(to) ?? false;
  if (!normalAllowed && !failureAllowed) return false;

  if (from === 'ACKNOWLEDGED' && to === 'VERIFIED') {
    return context.independent_verification_evidence;
  }

  return true;
};
