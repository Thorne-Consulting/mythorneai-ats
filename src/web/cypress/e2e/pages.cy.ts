// Opens every page of the app in dark mode at 1440 wide and saves a screenshot of each.
// Run with the web app on :3000 and the API on :5080 with dev sign-in: `npm run shots`.
// Record ids come from the seeded data, so the walk finds them at the start instead of hard-coding.
import {
  fitViewport,
  pageErrors,
  settle,
  shoot,
  signInAsCandidate,
  signInAsStaff,
  staffPost,
} from '../support/e2e';

type Ids = Record<string, string | null | undefined>;

// `--env only=<regex>` walks only the routes that match, for a quick check of one area.
const only = Cypress.env('only') ? new RegExp(String(Cypress.env('only'))) : null;
const wanted = (route: string) => !only || only.test(route);

/** Fills `{job}` and friends from the ids found at the start. Undefined when an id is missing. */
function fill(route: string, ids: Ids) {
  let missing = false;
  const out = route.replace(/\{(\w+)\}/g, (_, key) => {
    if (!ids[key]) missing = true;
    return ids[key] ?? '';
  });
  return missing ? undefined : out;
}

/** The first array in a response, whatever key it sits under. */
function firstArray(x: unknown): Record<string, unknown>[] {
  if (Array.isArray(x)) return x;
  const values = Object.values((x ?? {}) as Record<string, unknown>);
  return (values.find((v) => Array.isArray(v) && v.length) as Record<string, unknown>[]) ?? [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (url: string): Cypress.Chainable<any> =>
  cy.request({ url, failOnStatusCode: false }).then((r) => (r.status === 200 ? r.body : null));

/**
 * The record id in the first link on a page that matches a pattern; `/new` never counts. Lists
 * that load after the page shell have no placeholder, so this looks again for a few seconds.
 */
function linkedId(route: string, pattern: RegExp, tries = 8): Cypress.Chainable<string | null> {
  cy.visit(route);
  settle(route);
  const look = (left: number): Cypress.Chainable<string | null> =>
    cy.get('a[href]', { timeout: 30000 }).then(($as) => {
      const hrefs = $as.toArray().map((a) => a.getAttribute('href')?.split(/[?#]/)[0] ?? '');
      const hit = hrefs.find((h) => pattern.test(h) && !/\/new$/.test(h));
      if (!hit && left > 1) {
        cy.wait(1000);
        return look(left - 1);
      }
      // null, never undefined: an undefined return would hand the links on to the caller.
      const id =
        hit?.match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0] ?? hit?.split('/').filter(Boolean).pop();
      return cy.wrap(id ?? null, { log: false });
    }) as unknown as Cypress.Chainable<string | null>;
  return look(tries);
}

const STAFF_ROUTES = [
  '/',
  '/jobs',
  '/jobs/new',
  '/jobs/{job}',
  '/jobs/{job}/details',
  '/jobs/{job}/candidates',
  '/jobs/{job}/pipeline',
  '/jobs/{job}/pipeline?view=list',
  '/jobs/{job}/posting',
  '/jobs/{job}/requirements',
  '/jobs/{job}/kits',
  '/jobs/{job}/kits/new',
  '/jobs/{kitJob}/kits/{kit}',
  '/jobs/{kitJob}/kits/{kit}/edit',
  '/jobs/{job}/team',
  '/jobs/{job}/settings',
  '/pipeline',
  '/approvals',
  '/candidates',
  '/candidates/recent',
  '/candidates/active',
  '/candidates/hired',
  '/candidates/not-in-a-job',
  '/candidates/rejected',
  '/candidates/withdrawn',
  '/candidates/talent-pools',
  '/candidates/pools/{pool}',
  '/candidates/views/{view}',
  '/candidates/compare?ids={cand}',
  '/candidates/{cand}',
  '/candidates/{cand}/applications',
  '/candidates/{cand}/files',
  '/candidates/{cand}/resume',
  '/applications/{app}',
  '/applications/{app}/scorecards',
  '/applications/{app}/interviews',
  '/applications/{app}/messages',
  '/applications/{app}/offer',
  '/applications/{app}/activity',
  '/applications/compare?ids={app}',
  '/interviews',
  '/interviews/feedback',
  '/interviews/schedule',
  '/interviews/{interview}',
  '/interviews/{interview}/room',
  '/interviews/{interview}/recording',
  '/interviews/{interview}/summary',
  '/interviews/{interview}/feedback',
  '/assessments',
  '/assessments/new',
  '/assessments/{asmt}',
  '/assessments/{asmt}/edit',
  '/assessments/{asmt}/results/{result}',
  '/reports',
  '/reports/funnel',
  '/reports/velocity',
  '/reports/sources',
  '/reports/offers',
  '/reports/subscriptions',
  '/messages',
  '/messages/starred',
  '/messages/templates',
  '/messages/templates/new',
  '/messages/templates/{tpl}',
  '/notifications',
  '/help',
  '/settings',
  '/settings/profile',
  '/settings/preferences',
  '/settings/notifications',
  '/settings/availability',
  '/settings/members',
  '/settings/roles',
  '/settings/roles/{role}',
  '/settings/general',
  '/settings/careers',
  '/settings/email',
  '/settings/email/sent',
  '/settings/email/blocked',
  '/settings/alerts',
  '/settings/approvals',
  '/settings/calendar',
  '/settings/fields',
  '/settings/sources',
  '/settings/pipelines',
  '/settings/templates',
  '/settings/templates/new',
  '/settings/templates/email',
  '/settings/templates/{postTpl}',
  '/settings/interview-library',
  '/settings/interview-library/questions',
  '/settings/interview-library/templates/{libTpl}',
  '/settings/offer-letters',
  '/settings/offer-letters/{letter}',
  '/settings/rejection-reasons',
  '/settings/ai',
  '/settings/ai/activity',
  '/settings/webhooks',
  '/settings/sso',
  '/settings/activity',
  '/settings/workflows',
  '/settings/workflows/{wf}',
  '/careers/preview/{job}',
  '/design',
];

const PUBLIC_ROUTES = [
  '/careers',
  '/careers?q=zzzz',
  '/careers/{post}',
  '/careers/{post}/apply',
  '/candidate-portal',
  '/candidate-portal/link',
  '/book/not-a-real-token',
  '/approve/not-a-real-token',
  '/login',
];

const PORTAL_ROUTES = [
  '/candidate-portal/home',
  '/candidate-portal/applications',
  '/candidate-portal/interviews',
  '/candidate-portal/messages',
  '/candidate-portal/profile',
  '/candidate-portal/applications/{portalApp}',
  '/candidate-portal/applications/{portalApp}/emails',
  '/candidate-portal/applications/{portalApp}/interviews',
  '/candidate-portal/applications/{portalApp}/messages',
  '/candidate-portal/messages/{portalApp}',
  '/candidate-portal/assessments/{portalAsmt}',
];

const ids: Ids = {};

describe('staff pages', () => {
  before(() => {
    // The seeded portal candidates go back to their seeded state: the offer is open again, and
    // nothing is answered. Once, before anything else, because it gives them new ids.
    cy.request({
      method: 'POST',
      url: '/public/dev/local-candidates/reset',
      headers: { 'X-Candidate-Portal': '1' },
    });
    signInAsStaff();
    api('/api/requisitions').then((reqs) => {
      const jobs = firstArray(reqs) as { id: string; stages?: { count: number }[] }[];
      const job = jobs.find((j) => (j.stages ?? []).some((s) => s.count > 0)) ?? jobs[0];
      ids.job = job?.id;
      api(`/api/requisitions/${job.id}/board`).then((board) => {
        ids.app = board?.stages?.flatMap(
          (s: { applications: { id: string }[] }) => s.applications,
        )[0]?.id;
      });
      // A job with an interview kit, for the kit pages.
      cy.wrap(jobs.slice(0, 12)).each((j: { id: string }) => {
        if (ids.kit) return;
        api(`/api/requisitions/${j.id}`).then((detail) => {
          const kits = Object.entries(detail ?? {}).find(
            ([key, v]) => /kit/i.test(key) && Array.isArray(v) && v.length,
          )?.[1] as { id: string }[] | undefined;
          if (kits?.[0]) {
            ids.kit = kits[0].id;
            ids.kitJob = j.id;
          }
        });
      });
    });
    api('/api/candidates').then((c) => {
      ids.cand = firstArray(c)[0]?.id as string;
    });
    const from = new Date(Date.now() - 5e9).toISOString();
    const to = new Date(Date.now() + 5e9).toISOString();
    api(`/api/interviews?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(
      (i) => {
        ids.interview = firstArray(i)[0]?.id as string;
      },
    );
    // Ivy (interview@local.dev) gets one assessment if she has none, so the staff results page
    // and the portal's assessment page both have something to show.
    api('/api/assessments').then((all) => {
      const list = firstArray(all) as { id: string; status?: string; kind?: string }[];
      const asmt =
        list.find((a) => a.status === 'Active' && a.kind !== 'External') ??
        list.find((a) => a.status === 'Active') ??
        list[0];
      ids.asmt = asmt?.id;
      if (!asmt) return;
      api('/api/candidates?search=interview%40local.dev').then((found) => {
        const ivy = firstArray(found)[0] as { applications?: { id: string }[] } | undefined;
        const app = ivy?.applications?.[0]?.id;
        if (!app) return;
        api(`/api/applications/${app}/assessments`).then((sent) => {
          const invites = firstArray(sent) as { id: string; assessmentId?: string }[];
          const mine = invites.find((i) => i.assessmentId === asmt.id) ?? invites[0];
          if (mine) {
            ids.result = mine.id;
            ids.asmt = mine.assessmentId ?? ids.asmt;
            return;
          }
          staffPost(`/api/applications/${app}/assessments`, { assessmentId: asmt.id }).then((r) => {
            ids.result = (r.body as { id?: string })?.id;
          });
        });
      });
    });
    api('/api/templates').then((t) => {
      // A saved reply by id, else an automatic email by its key.
      ids.tpl = (t?.saved?.[0]?.id ?? t?.automatic?.[0]?.key) as string | undefined;
    });
    api('/api/posting-templates').then((t) => {
      ids.postTpl = firstArray(t)[0]?.id as string;
      if (ids.postTpl) return;
      // None yet: make one, so the template page has something to show.
      staffPost('/api/posting-templates', {
        name: 'Standard posting',
        headerMarkdown: 'About the team',
        descriptionMarkdown: 'What you will do here.',
        benefitsMarkdown: 'Health cover and paid time off.',
      }).then((r) => {
        ids.postTpl = (r.body as { id?: string })?.id;
      });
    });
    api('/api/talent-pools').then((p) => {
      ids.pool = firstArray(p)[0]?.id as string;
    });
    api('/api/saved-views?area=talent').then((v) => {
      ids.view = firstArray(v)[0]?.id as string;
    });
    linkedId(
      '/settings/interview-library',
      /^\/settings\/interview-library\/templates\/[^/]+$/,
    ).then((v) => (ids.libTpl = v));
    linkedId('/settings/offer-letters', /^\/settings\/offer-letters\/[^/]+$/).then(
      (v) => (ids.letter = v),
    );
    linkedId('/settings/roles', /^\/settings\/roles\/[^/]+$/).then((v) => (ids.role = v));
    linkedId('/settings/workflows', /^\/settings\/workflows\/[^/]+$/).then((v) => (ids.wf = v));
    linkedId('/careers', /^\/careers\/(?!preview)[^/]+$/).then((v) => (ids.post = v));
    cy.then(() => cy.log(JSON.stringify(ids)));
  });

  beforeEach(() => {
    cy.session('staff', () => signInAsStaff());
  });

  for (const route of STAFF_ROUTES.filter(wanted)) {
    it(route, function () {
      const real = fill(route, ids);
      if (!real) this.skip();
      shoot('staff', real!);
    });
  }

  it('/settings/email with the admin menu open', function () {
    if (!wanted('/settings/email')) this.skip();
    shoot('staff', '/settings/email', 'staff-desktop-dark_flow_settings-email');
  });
});

describe('public pages', () => {
  for (const route of PUBLIC_ROUTES.filter(wanted)) {
    it(route, function () {
      const real = fill(route, ids);
      if (!real) this.skip();
      shoot('public', real!);
    });
  }

  it('apply form: errors, then filled in', function () {
    const real = fill('/careers/{post}/apply', ids);
    if (!real || !wanted('/careers/apply')) this.skip();
    pageErrors.length = 0;
    cy.visit(real!);
    settle(real!);
    cy.contains('button', 'Submit application').click();
    cy.wait(600);
    fitViewport();
    cy.screenshot('public-desktop-dark_flow_apply-errors', {
      capture: 'viewport',
      overwrite: true,
    });
    cy.get('input[name="firstName"], input[autocomplete="given-name"]').first().type('Test');
    cy.get('input[name="lastName"], input[autocomplete="family-name"]').first().type('Applicant');
    cy.get('input[type="email"]').first().type('test.applicant@example.test');
    cy.wait(300);
    fitViewport();
    cy.screenshot('public-desktop-dark_flow_apply-filled', {
      capture: 'viewport',
      overwrite: true,
    });
    cy.viewport(1440, 900);
  });
});

for (const email of ['interview@local.dev', 'offer@local.dev']) {
  const tag = `portal-${email.split('@')[0]}`;
  describe(`candidate portal as ${email}`, () => {
    const portal: Ids = {};
    before(() => {
      signInAsCandidate(email);
      linkedId('/candidate-portal/home', /^\/candidate-portal\/applications\/[0-9a-f-]{36}$/).then(
        (v) => (portal.portalApp = v),
      );
      linkedId('/candidate-portal/home', /^\/candidate-portal\/assessments\/[^/]+$/).then(
        (v) => (portal.portalAsmt = v),
      );
      // The application that has an offer to answer, if this candidate has one.
      linkedId(
        '/candidate-portal/home',
        /^\/candidate-portal\/applications\/[0-9a-f-]{36}\/offer$/,
      ).then((v) => (portal.offerApp = v));
    });

    beforeEach(() => {
      cy.session(email, () => signInAsCandidate(email));
    });

    for (const route of PORTAL_ROUTES.filter(wanted)) {
      it(route, function () {
        const real = fill(route, portal);
        if (!real) this.skip();
        shoot(tag, real!);
      });
    }

    if (email.startsWith('offer')) {
      it('the offer, and its accept and decline dialogs', function () {
        if (!portal.offerApp) this.skip();
        const route = `/candidate-portal/applications/${portal.offerApp}/offer`;
        shoot(tag, route);
        cy.contains('button', /^Accept/).click();
        cy.wait(400);
        cy.screenshot(`${tag}-desktop-dark_flow_offer-accept-dialog`, { overwrite: true });
        cy.get('body').type('{esc}');
        cy.contains('button', /^Decline/).click();
        cy.wait(400);
        cy.screenshot(`${tag}-desktop-dark_flow_offer-decline-dialog`, { overwrite: true });
        cy.get('body').type('{esc}');
      });
    }
  });
}
