import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'cypress';

// The page walk writes one line per page here; `npm run shots` moves it next to the screenshots.
const INDEX = 'cypress/screenshots/index-desktop-dark.tsv';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    viewportWidth: 1440,
    viewportHeight: 900,
    video: false,
    screenshotOnRunFailure: false,
    trashAssetsBeforeRuns: true,
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 90000,
    setupNodeEvents(on) {
      // Headless Electron opens at 1280 wide and scales a wider viewport down; make the window bigger.
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.name === 'electron') {
          launchOptions.preferences.width = 1600;
          launchOptions.preferences.height = 1000;
        }
        return launchOptions;
      });
      on('before:run', () => {
        mkdirSync('cypress/screenshots', { recursive: true });
        writeFileSync(INDEX, 'route\tfile\tproblem\tconsole errors\n');
      });
      on('task', {
        index(line: string) {
          appendFileSync(INDEX, line + '\n');
          return null;
        },
      });
    },
  },
});
