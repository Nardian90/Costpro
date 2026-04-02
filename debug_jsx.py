import re
import sys

def analyze_jsx(filename):
    with open(filename, 'r') as f:
        content = f.read()
    content = re.sub(r'{\/\*.*?\*\/}', '', content, flags=re.DOTALL)
    tokens = re.findall(r'</?[A-Za-z0-9.]+|/>|{|}', content)
    stack = []
    current_pos = 0
    line_num = 1
    for token in tokens:
        pos = content.find(token, current_pos)
        newlines = content.count('\n', current_pos, pos)
        line_num += newlines
        current_pos = pos + len(token)
        if token == '{':
            stack.append(('{', line_num))
        elif token == '}':
            if not stack:
                print(f"Error: Unexpected '}}' at line {line_num}")
            else:
                t, l = stack.pop()
                if t != '{':
                    print(f"Error: Mismatched '}}' at line {line_num}, expected close for {t} from line {l}")
        elif token == '/>':
            if stack and stack[-1][0].startswith('<'):
                stack.pop()
        elif token.startswith('</'):
            tag_name = token[2:]
            if not stack:
                print(f"Error: Unexpected closing tag </{tag_name}> at line {line_num}")
            else:
                t, l = stack.pop()
                if not t.startswith('<') or t[1:] != tag_name:
                    print(f"Error: Mismatched closing tag </{tag_name}> at line {line_num}, expected </{t[1:] if t.startswith('<') else t}> from line {l}")
        elif token.startswith('<'):
            tag_name = token[1:]
            end_bracket = content.find('>', pos)
            if end_bracket != -1 and content[end_bracket-1] == '/':
                pass
            else:
                stack.append(('<' + tag_name, line_num))
    print("\n--- Remaining Stack ---")
    for t, l in stack:
        print(f"Unclosed {t} from line {l}")

if __name__ == "__main__":
    analyze_jsx(sys.argv[1])
