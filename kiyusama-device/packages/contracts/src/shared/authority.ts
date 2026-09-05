export type AuthorityLevel = 'R0' | 'R1' | 'R2' | 'R3';
export type AuthorityRef = string;

export interface AuthorityRequirement {
  readonly required_authority: AuthorityLevel;
  readonly approval_required: boolean;
}
