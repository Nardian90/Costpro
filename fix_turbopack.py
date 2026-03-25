import re

file_path = 'src/app/api/academy/generate/route.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Fix the path.join calls to include the Turbopack ignore comment without spaces
# Previous: path.join(/*turbopackIgnore:true*/process.cwd(), 'public', 'manuals')
# Target: path.join(/*turbopackIgnore:true*/process.cwd(), 'public', 'manuals')
# Wait, my previous read showed it ALREADY had the comment.
# Let's check if there are others or if it needs a specific format.
# The warning says: add ignore comments: path.join(/*turbopackIgnore: true*/ process.cwd(), bar)
# Note the SPACE in their example: /*turbopackIgnore: true*/ process.cwd()
# But the memory says: use the exact syntax /*turbopackIgnore:true*/ (no spaces)

# Let's see what's actually in the file again carefully.
