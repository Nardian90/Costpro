import sys

def apply_diff(file_path, diff_path):
    with open(file_path, 'r') as f:
        content = f.read()

    with open(diff_path, 'r') as f:
        diff_lines = f.readlines()

    i = 0
    while i < len(diff_lines):
        if diff_lines[i].startswith('<<<<<<< SEARCH'):
            search_block = []
            i += 1
            while i < len(diff_lines) and not diff_lines[i].startswith('======='):
                search_block.append(diff_lines[i])
                i += 1

            replace_block = []
            i += 1
            while i < len(diff_lines) and not diff_lines[i].startswith('>>>>>>> REPLACE'):
                replace_block.append(diff_lines[i])
                i += 1

            search_str = "".join(search_block)
            replace_str = "".join(replace_block)

            if search_str in content:
                content = content.replace(search_str, replace_str, 1)
            else:
                print(f"Search block not found in {file_path}: {search_str}")
                sys.exit(1)
        i += 1

    with open(file_path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    apply_diff(sys.argv[1], sys.argv[2])
