from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    # open a chat with user and assistant message and tool calls

    # for simplicity, let's just use the current page
    page = browser.new_page()
    page.goto("http://localhost:5173/")
    page.wait_for_timeout(2000)

    # Click on the textarea, type some text, and send it
    page.fill('textarea', 'Hello')
    page.press('textarea', 'Enter')
    page.wait_for_timeout(2000)

    page.screenshot(path="/home/jules/verification/screenshots/screenshot_chat.png")

    # Also open the settings to see it
    page.goto("http://localhost:5173/")
    page.wait_for_timeout(2000)
    page.click('text=Settings')
    page.wait_for_timeout(2000)
    page.screenshot(path="/home/jules/verification/screenshots/screenshot_settings.png")
    browser.close()
