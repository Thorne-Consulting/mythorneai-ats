// Shared setup for the page walk: dark mode, console error capture, and sign-in helpers.

/** Console errors and uncaught exceptions on the page open now. Cleared by `shoot`. */
export const pageErrors: string[] = [];

// Cypress puts its own <script> into the page head. React 19 reports that as a hydration mismatch
// on every page, so the walk cannot check hydration; a Playwright run showed none. A server
// redirect in `next dev` logs "cannot have a negative time stamp" from Next's own timing code.
const CYPRESS_NOISE =
  /Encountered a script tag while rendering|Hydration failed because|cannot have a negative time stamp/;

Cypress.on('window:before:load', (win) => {
  // The app reads this before first paint, so every page opens in dark mode.
  win.localStorage.setItem('ats-theme', 'dark');
  const original = win.console.error;
  win.console.error = (...args: unknown[]) => {
    const text = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ');
    if (!CYPRESS_NOISE.test(text)) pageErrors.push(text.replace(/\s+/g, ' ').slice(0, 300));
    original.apply(win.console, args);
  };
});

Cypress.on('uncaught:exception', (error) => {
  if (!CYPRESS_NOISE.test(String(error)))
    pageErrors.push(`uncaught: ${String(error).replace(/\s+/g, ' ').slice(0, 300)}`);
  return false;
});

/** Signs in as a staff member through the dev sign-in and sets the account to dark mode. */
export function signInAsStaff(email = 'admin@example.test') {
  cy.request('POST', '/api/auth/dev-login', { email });
  cy.request('/api/auth/csrf').then(({ body }) => {
    cy.request({
      method: 'PUT',
      url: '/api/me/preferences',
      headers: { 'X-CSRF-TOKEN': body.token },
      body: { theme: 'dark' },
    });
  });
}

/**
 * Signs in to the candidate portal. Every @local.dev candidate gets the code 123456 in development.
 * The portal allows 60 requests a minute from one address, so a run that just walked the portal
 * as another candidate may be told to wait; then this waits and tries again.
 */
export function signInAsCandidate(email: string, tries = 6) {
  const headers = { 'X-Candidate-Portal': '1' };
  cy.request({
    method: 'POST',
    url: '/public/portal/access-code',
    headers,
    body: { email },
    failOnStatusCode: false,
  }).then((r) => {
    if (r.status === 429 && tries > 1) {
      cy.wait(15000);
      signInAsCandidate(email, tries - 1);
      return;
    }
    expect(r.status, 'asked for a sign-in code').to.be.within(200, 299);
    cy.request({
      method: 'POST',
      url: '/public/portal/verify',
      headers,
      body: { email, code: '123456' },
    });
  });
}

/** A staff POST with the CSRF token the API asks for. */
export function staffPost(url: string, body: Record<string, unknown>) {
  return cy
    .request('/api/auth/csrf')
    .then(({ body: csrf }) =>
      cy.request({ method: 'POST', url, headers: { 'X-CSRF-TOKEN': csrf.token }, body }),
    );
}

/** The screenshot name for a route, in the same pattern as the older screenshots. */
export const shotName = (tag: string, route: string) =>
  `${tag}-desktop-dark${route.replace(/[/?=&]/g, '_') || '_root'}`.slice(0, 180);

/** Waits until the page has loaded: no loading placeholder pulses any more. */
export function settle(route = '') {
  cy.get('body', { timeout: 60000 }).should('be.visible');
  // The design gallery shows a placeholder on purpose, so it never stops pulsing.
  if (!route.startsWith('/design'))
    cy.get('.animate-pulse', { timeout: 30000 }).should('not.exist');
  cy.wait(600);
  cy.document().then((doc) => {
    // React regenerates the page after the hydration mismatch above, which drops the `dark` class
    // the inline theme script set; put it back. Then drop Next's dev "Issues" badge from the shot.
    doc.documentElement.classList.add('dark');
    doc.querySelectorAll('nextjs-portal').forEach((el) => el.remove());
  });
  cy.wait(200);
}

/** Makes the viewport as tall as the page, so one shot holds it all and the fixed shell shows once. */
export function fitViewport() {
  cy.document().then((doc) => {
    const height = Math.min(Math.max(doc.documentElement.scrollHeight, 900), 6000);
    cy.viewport(1440, height);
  });
  cy.wait(300);
}

/**
 * Opens a page, waits for it to settle, checks it is a real page, and saves a full-page screenshot.
 * Writes a line to the index with any console errors. Fails on a missing page or a crash.
 */
export function shoot(tag: string, route: string, name = shotName(tag, route)) {
  pageErrors.length = 0;
  cy.visit(route, { failOnStatusCode: false });
  settle(route);
  cy.get('body').then(($body) => {
    const text = $body.text();
    const problem =
      /page not found|could not find|couldn.t load|something went wrong|application error/i.test(
        text.slice(0, 2000),
      )
        ? 'NOTFOUND'
        : '';
    // The index line first: a failed check below would otherwise drop it.
    cy.task('index', [route, `${name}.png`, problem, pageErrors.join(' | ')].join('\t'));
    cy.then(() => {
      expect(problem, `${route} is a real page`).to.equal('');
      const crash = pageErrors.find((e) => e.startsWith('uncaught:'));
      expect(crash, `${route} did not crash`).to.equal(undefined);
    });
  });
  fitViewport();
  cy.screenshot(name, { capture: 'viewport', overwrite: true });
  cy.viewport(1440, 900);
}
