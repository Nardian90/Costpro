#!/zsh
# Start the dev server and run playwright against the verification page
kill $(lsof -t -i :3000) 2>/dev/null || true
npm run dev > dev_server.log 2>&1 &
sleep 15
npx playwright h screenshot http://localhost:3000/verify-header --name header-desktop --viewport-width 1280 --viewport-height 200
npx playwright h screenshot http://localhost:3000/verify-header --name header-mobile --viewport-width 360 --viewport-height 800
