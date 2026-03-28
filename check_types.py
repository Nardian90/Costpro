import subprocess
import sys

def main():
    files = [
        "src/services/pick3/Pick3ScraperService.ts",
        "src/app/api/pick3/sync/route.ts",
        "src/components/views/terminal/views/pick3/Pick3IntelligenceView.tsx",
        "src/services/pick3/backtest.engine.ts"
    ]

    cmd = ["bun", "x", "tsc", "--noEmit", "--skipLibCheck", "--esModuleInterop", "--jsx", "react-jsx"] + files
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)

    print("STDOUT:")
    print(result.stdout)
    print("STDERR:")
    print(result.stderr)

    if result.returncode == 0:
        print("✅ No type errors found in specified files.")
    else:
        print(f"❌ Found type errors (exit code {result.returncode}).")

if __name__ == "__main__":
    main()
