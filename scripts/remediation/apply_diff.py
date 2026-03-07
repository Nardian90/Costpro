import sys
import os

def apply_diff(filepath, search_str, replace_str):
    with open(filepath, 'r') as f:
        content = f.read()
    if search_str not in content:
        print(f"Error: Search string not found in {filepath}")
        # Print a bit of the content and search string for debugging
        print(f"Search string: {search_str[:100]}...")
        sys.exit(1)
    new_content = content.replace(search_str, replace_str)
    with open(filepath, 'w') as f:
        f.write(new_content)
    print(f"Successfully updated {filepath}")

if __name__ == "__main__":
    filepath = sys.argv[1]
    # Read search and replace from stdin separated by a unique delimiter
    data = sys.stdin.read()
    search_str, replace_str = data.split('---REPLACE_WITH---')
    apply_diff(filepath, search_str, replace_str)
