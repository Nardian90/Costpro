import json
import os

def fix_package_json():
    path = "package.json"
    with open(path, "r") as f:
        data = json.load(f)

    # Ensure critical build tools are in dependencies
    critical = ["typescript", "vitest", "@vitest/coverage-v8", "jsdom", "ts-node"]
    if "devDependencies" in data:
        for pkg in critical:
            if pkg in data["devDependencies"]:
                data["dependencies"][pkg] = data["devDependencies"].pop(pkg)
                print(f"Moved {pkg} to dependencies")

    # Revert build script to use npx/standard next
    build_script = data["scripts"]["build"]
    if "bun x next build" in build_script:
        data["scripts"]["build"] = build_script.replace("bun x next build", "npx next build")
        print("Updated build script to use npx next build")

    with open(path, "w") as f:
        json.dump(data, f, indent=2)

if __name__ == "__main__":
    fix_package_json()
