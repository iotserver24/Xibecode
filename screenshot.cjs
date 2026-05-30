const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000); // wait for load

  // type something to see the user bubble
  await page.fill('textarea', 'Hello World');
  await page.keyboard.press('Enter');

  await page.waitForTimeout(1000); // wait for chat update
  await page.screenshot({ path: '/home/jules/verification/screenshots/final.png' });
  await browser.close();
})();
