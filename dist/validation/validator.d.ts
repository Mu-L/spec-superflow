import { ValidationReport } from './types.js';
import type { VerificationReport } from './types.js';
export declare class Validator {
    private strictMode;
    constructor(strictMode?: boolean);
    validateSpecContent(specName: string, content: string): ValidationReport;
    validateChangeContent(changeName: string, content: string): ValidationReport;
    validateDeltaSpec(content: string): ValidationReport;
    validateImplementation(diffSummary: string, specContent: string, designContent: string): VerificationReport;
    private extractRequirementNames;
    private extractDecisionNames;
    isValid(report: ValidationReport): boolean;
}
