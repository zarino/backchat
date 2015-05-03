I never managed to get these tests working. Something about the combination of Electron, Selenium, and ChromeDriver just didn’t work.

Here’s what I was running:

1. `brew install chromedriver selenium-server-standalone`
2. In one tab: `chromedriver`
3. In a second tab: `selenium-server -p 4444`
4. In a third tab: `npm install` from the root level of the Backchat repo.
3. Run `npm test`.
