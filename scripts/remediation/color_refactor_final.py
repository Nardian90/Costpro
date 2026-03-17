import os
import re

MAPPINGS = {
    # Text
    r'text-white(?!\/)': 'text-foreground',
    r'text-black(?!\/)': 'text-foreground',
    r'text-gray-500': 'text-muted-foreground',
    r'text-gray-400': 'text-muted-foreground',
    r'text-gray-600': 'text-muted-foreground',

    # Background
    r'bg-white(?!\/)': 'bg-background',
    r'bg-black(?!\/)': 'bg-background',
    r'bg-gray-50': 'bg-muted/50',
    r'bg-gray-100': 'bg-muted',

    # Border
    r'border-gray-200': 'border-border',
    r'border-gray-300': 'border-border',
}

EXTENSIONS = ('.ts', '.tsx', '.js', '.jsx')

def refactor_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        new_content = content
        for pattern, replacement in MAPPINGS.items():
            new_content = re.sub(pattern, replacement, new_content)

        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            return True
    except:
        pass
    return False

def main():
    files_updated = 0
    for root, dirs, files in os.walk('src'):
        for file in files:
            if file.endswith(EXTENSIONS):
                if refactor_file(os.path.join(root, file)):
                    files_updated += 1
    print(f"Refactored {files_updated} files in src/")

if __name__ == "__main__":
    main()
