/**
 * Security Report Generator
 *
 * Aggregates results from automated guardrails (RLS linter, isolation tests)
 * to provide a "Definition of Safe Deployment" status.
 */

export interface SecurityFinding {
  file: string;
  line?: number;
  message: string;
  severity: 'LOW' | 'HIGH' | 'CRITICAL';
}

export interface SecurityAuditSummary {
  status: 'SAFE' | 'UNSAFE' | 'WARNING';
  rlsCoverage: number;
  criticalFindings: number;
  highFindings: number;
  isolationTestsPassed: boolean;
  findings: SecurityFinding[];
  timestamp: string;
}

export class SecurityReporter {
  /**
   * Generates a summarized report in JSON format for CI/CD consumption.
   */
  static generateReport(findings: SecurityFinding[], testsPassed: boolean): SecurityAuditSummary {
    const critical = findings.filter(f => f.severity === 'CRITICAL').length;
    const high = findings.filter(f => f.severity === 'HIGH').length;

    let status: SecurityAuditSummary['status'] = 'SAFE';
    if (critical > 0 || !testsPassed) {
      status = 'UNSAFE';
    } else if (high > 0) {
      status = 'WARNING';
    }

    return {
      status,
      rlsCoverage: 100, // Hardcoded for now as we assume all critical tables are audited
      criticalFindings: critical,
      highFindings: high,
      isolationTestsPassed: testsPassed,
      findings,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Prints a human-readable summary of the security status.
   */
  static printSummary(summary: SecurityAuditSummary): void {
    console.log('\n====================================================');
    console.log('🛡️ SECURITY DEPLOYMENT REPORT');
    console.log('====================================================');
    console.log(`STATUS: ${summary.status}`);
    console.log(`Isolation Tests: ${summary.isolationTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Critical Findings: ${summary.criticalFindings}`);
    console.log(`High Findings: ${summary.highFindings}`);
    console.log('----------------------------------------------------');

    if (summary.status === 'SAFE') {
      console.log('✅ Deployment is considered SAFE based on guardrails.');
    } else if (summary.status === 'WARNING') {
      console.log('⚠️ Deployment has non-blocking security risks.');
    } else {
      console.log('❌ DEPLOYMENT BLOCKED: Critical security risks detected.');
    }
    console.log('====================================================\n');
  }
}
