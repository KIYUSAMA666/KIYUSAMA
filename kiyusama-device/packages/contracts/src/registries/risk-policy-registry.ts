import type { AuthorityLevel } from '../shared/authority.js';

export interface RiskPolicyEntry {
  readonly policy_id: string;
  readonly event_type: string;
  readonly requested_capability: string;
  readonly risk_class: AuthorityLevel;
  readonly required_authority: AuthorityLevel;
  readonly approval_required: boolean;
  readonly version: string;
  readonly integrity_hash: string;
  readonly change_risk: 'R2+';
}

export interface RiskPolicyRegistry {
  get(policy_id: string): Readonly<RiskPolicyEntry> | undefined;
}
