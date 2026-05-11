import sys

def apply_diff(file_path, diff_path):
    with open(file_path, 'r') as f:
        content = f.read()

    with open(diff_path, 'r') as f:
        diff = f.read()

    parts = diff.split('<<<<<<< SEARCH')
    for part in parts[1:]:
        search_replace = part.split('=======')
        if len(search_replace) < 2: continue
        search = search_replace[0].strip('\n')
        replace = search_replace[1].split('>>>>>>> REPLACE')[0].strip('\n')

        if search in content:
            content = content.replace(search, replace)
        else:
            print(f"Error: Search block not found in {file_path}")
            sys.exit(1)

    with open(file_path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    apply_diff(sys.argv[1], sys.argv[2])
