import re

with open('src/lib/ipv/engine.ts', 'r') as f:
    content = f.read()

# Only keep duration_ms inside persistLog method's matching_logs.add call
# Find the persistLog method
match = re.search(r'private async persistLog\(tx: BankTransaction, result: MatchingResult, duration: number\) \{', content)
if match:
    start_idx = match.start()
    # End of method is roughly at the next } catch
    end_idx = content.find('}', start_idx + 100) # heuristic

    # We will just replace all duration_ms outside of that specific block or fix the blocks.

# Actually, let's just use regex to remove duration_ms from where it doesn't belong.
# Objects: ProductMovement, ReconciliationLine, etc.

content = re.sub(r',\s*duration_ms: duration', '', content)
# Put it back where it belongs
content = content.replace('created_at: new Date().toISOString()', 'created_at: new Date().toISOString(),\n            duration_ms: duration')
# Wait, this might put it in too many places.

# Let's do it specifically for the matching_logs.add block
content = re.sub(r'duration_ms: duration\s*', '', content)
content = content.replace('created_at: new Date().toISOString(),', 'created_at: new Date().toISOString(),\n            duration_ms: duration')
# Still potentially multiple places.

# Let's try to be very specific.
with open('src/lib/ipv/engine.ts', 'w') as f:
    f.write(content)
