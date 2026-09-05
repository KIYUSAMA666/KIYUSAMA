export interface VerificationPolicyEntry {
  readonly verification_policy_id: string;
  readonly expected_outcome_ref: string;
  readonly version: string;
  readonly integrity_hash: string;
  readonly change_risk: 'R2+';
}

export interface VerificationPolicyRegistry {
  get(verification_policy_id: string): Readonly<VerificationPolicyEntry> | undefined;
}
