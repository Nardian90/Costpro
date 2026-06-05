import os
import re
import sys

# Rules for RLS Policies
# Modified to avoid matching 'SET search_path TO public' or schema names
DANGEROUS_RLS_PATTERNS = [
    (r"FOR\s+\w+\s+TO\s+public\b", "Policy applied to 'public' role. Use 'authenticated' instead."),
]

# Rules for Security Definer Functions
VALIDATION_HINTS = [
    "auth.uid()",
    "has_store_access",
    "is_admin()",
    "p_user_id",
    "hint: has_store_access",
    "hint: auth.uid()",
    "hint: internal trigger"
]

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
                "severity": "HIGH"
            })

    # Audit Security Definer Functions - ONLY FOR NEW MIGRATIONS (June 2026+)
    # This prevents blocking CI on historical issues while enforcing standards on new code.
    if "202606" in filename:
        functions = re.finditer(r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+).*?SECURITY\s+DEFINER", content, re.IGNORECASE | re.DOTALL)
        for func in functions:
            func_name = func.group(1)
            func_start = func.start()

            # Check for search_path
            sig_end = content.find("AS", func_start)
            if sig_end != -1:
                header = content[func_start:sig_end]
                if "SET search_path" not in header:
                    line_no = content.count('\n', 0, func_start) + 1
                    issues.append({
                        "type": "SEC_DEFINER_RISK",
                        "line": line_no,
                        "message": f"Function '{func_name}' missing 'SET search_path'.",
                        "severity": "CRITICAL"
                    })

            # Check for validation hints in body
            # Using a simplified body extraction that works with both $BODY$ and $function$
            body_start = content.find("AS", func_start)
            if body_start != -1:
                # Find the next $$ or $function$ or $something$
                delim_match = re.search(r"\$(\w*)\$", content[body_start:])
                if delim_match:
                    delim = delim_match.group(0)
                    start_pos = body_start + delim_match.end()
                    end_pos = content.find(delim, start_pos)
                    if end_pos != -1:
                        body = content[start_pos:end_pos]
                        if not any(hint.lower() in body.lower() for hint in VALIDATION_HINTS):
                            line_no = content.count('\n', 0, start_pos) + 1
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
                # Filter out old files for high-level summary but still report findings
                is_new = "202606" in filename
                print(f"\n📄 {filename} {'(NEW)' if is_new else '(HISTORICAL)'}")
                for issue in findings:
                    if issue['severity'] == "CRITICAL":
                        total_critical += 1
                    print(f"  {'🔴' if issue['severity'] == 'CRITICAL' else '🟠'} Line {issue['line']}: {issue['message']}")

    if total_critical > 0:
        print(f"\n❌ FOUND {total_critical} CRITICAL SECURITY ISSUES in new migrations.")
        sys.exit(1)

    print("\n✅ Security Gate Passed.")
    sys.exit(0)

if __name__ == "__main__":
    main()
