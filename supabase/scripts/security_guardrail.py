import os
import re
import sys

# Rules for RLS Policies
DANGEROUS_RLS_PATTERNS = [
    (r"USING\s*\(\s*true\s*\)", "Permissive USING (true) policy detected. This allows access to all rows."),
    (r"WITH\s*CHECK\s*\(\s*true\s*\)", "Permissive WITH CHECK (true) policy detected."),
    (r"TO\s*public", "Policy applied to 'public' role. Use 'authenticated' instead."),
]

# Rules for Security Definer Functions
VALIDATION_HINTS = ["auth.uid()", "has_store_access", "is_admin()", "p_user_id"]

def audit_sql_content(filename, content):
    issues = []

    # Audit RLS Policies
    for pattern, message in DANGEROUS_RLS_PATTERNS:
        matches = re.finditer(pattern, content, re.IGNORECASE)
        for match in matches:
            line_no = content.count('\n', 0, match.start()) + 1
            issues.append({
                "type": "RLS_RISK",
                "line": line_no,
                "message": message,
                "severity": "CRITICAL" if "true" in pattern else "HIGH"
            })

    # Audit Security Definer Functions
    functions = re.finditer(r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+).*?SECURITY\s+DEFINER", content, re.IGNORECASE | re.DOTALL)
    for func in functions:
        func_name = func.group(1)
        func_start = func.start()

        # Boundary check for headers
        sig_end = content.find("AS", func_start)
        if sig_end != -1:
            header = content[func_start:sig_end]
            if "SET search_path" not in header:
                line_no = content.count('\n', 0, func_start) + 1
                issues.append({
                    "type": "SEC_DEFINER_RISK",
                    "line": line_no,
                    "message": f"Function '{func_name}' missing 'SET search_path'.",
                    "severity": "HIGH"
                })

        # Check body
        body_match = re.search(rf"FUNCTION\s+public\.{func_name}.*?AS\s+\$(.*?)\$(.*?)\$\1\$", content, re.IGNORECASE | re.DOTALL)
        if body_match:
            body = body_match.group(2)
            if not any(hint in body for hint in VALIDATION_HINTS):
                line_no = content.count('\n', 0, body_match.start(2)) + 1
                issues.append({
                    "type": "SEC_DEFINER_RISK",
                    "line": line_no,
                    "message": f"Function '{func_name}' potentially bypasses RLS without validation.",
                    "severity": "CRITICAL"
                })

    return issues

def main():
    migration_dir = "supabase/migrations"
    if not os.path.exists(migration_dir):
        print(f"Error: {migration_dir} not found.")
        sys.exit(1)

    files = sorted([f for f in os.listdir(migration_dir) if f.endswith(".sql")])
    total_critical = 0

    for filename in files:
        with open(os.path.join(migration_dir, filename), 'r', encoding='utf-8') as f:
            findings = audit_sql_content(filename, f.read())
            if findings:
                print(f"\n📄 {filename}")
                for issue in findings:
                    if issue['severity'] == "CRITICAL": total_critical += 1
                    print(f"  {'🔴' if issue['severity'] == 'CRITICAL' else '🟠'} Line {issue['line']}: {issue['message']}")

    if total_critical > 0:
        print(f"\n❌ FOUND {total_critical} CRITICAL SECURITY ISSUES.")
        sys.exit(1)

    print("\n✅ No critical security issues found.")
    sys.exit(0)

if __name__ == "__main__":
    main()
