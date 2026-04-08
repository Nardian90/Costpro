import re

file_path = 'src/services/pick3/Pick3ScraperService.ts'
with open(file_path, 'r') as f:
    content = f.read()

# The current code has a very old User-Agent or maybe no modern headers
# Let's check what's there
# Actually, I'll just replace the fetch calls to use a more robust header set if needed
# but I'll focus on the JSON endpoint which returned null in my curl

new_content = content.replace(
    "const response = await fetch('https://floridalottery.com/content/flalottery-web/us/en/games/draw-games/pick-3.draw-games.json', {",
    "const response = await fetch('https://floridalottery.com/content/flalottery-web/us/en/games/draw-games/pick-3.draw-games.json', {\n        cache: 'no-store',"
)

with open(file_path, 'w') as f:
    f.write(new_content)
