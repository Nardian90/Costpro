import json
import os

def fix_package_json():
    path = "package.json"
    with open(path, "r") as f:
        data = json.load(f)

    # Move critical build tools to dependencies for production environment
    to_move = ["typescript", "vitest", "@vitest/coverage-v8", "jsdom", "ts-node"]
    if "devDependencies" in data:
        for pkg in to_move:
            if pkg in data["devDependencies"]:
                data["dependencies"][pkg] = data["devDependencies"].pop(pkg)
                print(f"Moved {pkg} to dependencies")

    # Update build script to use bun x
    build_script = data["scripts"]["build"]
    if "npx next build" in build_script:
        data["scripts"]["build"] = build_script.replace("npx next build", "bun x next build")
        print("Updated build script to use bun x")

    with open(path, "w") as f:
        json.dump(data, f, indent=2)

if __name__ == "__main__":
    fix_package_json()
