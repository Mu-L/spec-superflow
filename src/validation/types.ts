export type ValidationLevel = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationIssue {
  level: ValidationLevel;
  path: string;
  message: string;
  line?: number;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

export type VerificationDimension = 'Completeness' | 'Correctness' | 'Coherence';
export type VerificationStatus = 'PASS' | 'FAIL' | 'WARN';

export interface VerificationFinding {
  level: 'CRITICAL' | 'IMPORTANT' | 'INFO';
  dimension: VerificationDimension;
  message: string;
}

export interface VerificationReport {
  dimensions: {
    name: VerificationDimension;
    status: VerificationStatus;
    findings: VerificationFinding[];
  }[];
  verdict: 'PASS' | 'CONDITIONAL' | 'FAIL';
}
