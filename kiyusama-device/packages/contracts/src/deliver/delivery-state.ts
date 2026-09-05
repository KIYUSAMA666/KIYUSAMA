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

export const canTransitionDeliveryState = (
  from: DeliveryState,
  to: DeliveryState,
  context: DeliveryTransitionContext,
): boolean => {
  if (from === 'ACKNOWLEDGED' && to === 'VERIFIED') {
    return context.independent_verification_evidence;
  }
  return true;
};
