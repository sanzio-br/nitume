// Static checks for the issue #7 code (customer-v-new-category §W10;
// NC§W9.17 (a)–(f); gap report G7-34, G7-36, G7-38). Outside src/app/ on
// purpose: the patterns below would trip the #5 raw-colour scan.
// #8 extends the lists below and adds its own block at the end
// (customer-x-awaiting-quote A§11 item 6, A.T14; gap report G8-39).
//
// "#7 code" = every file in a #7 folder, the kit files #7 changed, and every
// file a #7 route component (or the customer route tree) reaches through
// static imports, with their templateUrl / styleUrl files.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const srcDir = resolve(process.cwd(), 'src');
const appDir = resolve(srcDir, 'app');

/** §W10 item 2: never statically reachable from src/main.ts (#6 F9.50 + shared/places). */
const FORBIDDEN_EAGER = /^app\/(core\/auth|core\/realtime|app-area|shared\/ui|shared\/places)\//;

/** The only file the colour scan excepts, by exact path (WQ-26). */
const GOOGLE_ATTRIBUTION = 'assets/third-party/google-maps-attribution.svg';

const ISSUE_7_DIRS = [
  'app-area/customer',
  'shared/places',
  'shared/ui/wizard-frame',
  'shared/ui/stepper',
  'shared/ui/fixed-cta',
  'shared/ui/category',
  'shared/ui/choice-chip',
  'shared/ui/receipt',
  'shared/ui/notification-bell',
  'shared/ui/avatar',
  'shared/ui/search-entry',
  'shared/ui/active-task-card',
  'shared/ui/task-row',
  'shared/ui/place-field',
  'shared/ui/shopping-list',
  // #8 (A§11 item 6): the four kit folders (app-area/customer is listed above).
  'shared/ui/radio-row',
  'shared/ui/payment-method-card',
  'shared/ui/copy-row',
  'shared/ui/pulsing-dots',
];

/** Kit files #7 changed (§W9a). */
const ISSUE_7_CHANGED = [
  'app-area/customer.routes.ts',
  'shared/ui/icon/icons.ts',
  'shared/format/category.ts',
  'shared/format/formatters.ts',
  'shared/format/format.pipes.ts',
  'shared/ui/back-button/back-button.component.ts',
  'shared/ui/back-button/back-button.component.scss',
  'shared/ui/pushed-header/pushed-header.component.ts',
  'shared/ui/field/field.component.ts',
  'shared/ui/field/field.component.html',
  'shared/ui/field/field.component.scss',
  'shared/ui/field/field-value.directive.ts',
  'shared/ui/card/card.component.ts',
  'shared/ui/card/section-label.component.ts',
  'shared/ui/overlay/dialog.component.ts',
  'shared/ui/overlay/dialog.component.html',
  'shared/ui/template-outlet.directive.ts',
  'shared/map/maps-loader.service.ts',
  'core/realtime/realtime.service.ts',
  // Kit files #8 changed (A§8).
  'shared/ui/overlay/panel.component.ts',
  'shared/ui/active-task-card/active-task-card.component.ts',
  'shared/ui/links.ts',
];

/** The #7 route components, plus the customer route tree that loads them. */
const ISSUE_7_ENTRIES = [
  'app-area/customer/home/home.page.ts',
  'app-area/customer/new-task/new-category.page.ts',
  'app-area/customer/new-task/new-details.page.ts',
  'app-area/customer/new-task/new-review.page.ts',
  'app-area/customer.routes.ts',
  // #8: the three pages, the price-change dialog and the watcher.
  'app-area/customer/checkout/awaiting-quote.page.ts',
  'app-area/customer/checkout/payment.page.ts',
  'app-area/customer/checkout/merchant-payment.page.ts',
  'app-area/customer/checkout/price-change-dialog.component.ts',
  'app-area/customer/checkout/price-change.watcher.ts',
];

/** Relative module specifiers of static imports and re-exports (not `import()`, not type-only). */
function staticSpecifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const out: string[] = [];
  for (const m of code.matchAll(/^\s*(import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
    if (m[2]) continue;
    out.push(m[3]);
  }
  return out;
}

function resolveModule(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(candidate)) return candidate;
  return null;
}

function eagerGraph(entry: string, read: (file: string) => string = (f) => readFileSync(f, 'utf8')): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of staticSpecifiers(read(file))) {
      const next = resolveModule(file, spec);
      if (next) stack.push(next);
    }
  }
  return seen;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** templateUrl / styleUrl(s) of a component file. */
function resourcesOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of source.matchAll(/(?:templateUrl|styleUrl)\s*:\s*['"]([^'"]+)['"]/g)) out.push(resolve(dirname(file), m[1]));
  for (const m of source.matchAll(/styleUrls\s*:\s*\[([^\]]*)\]/g)) {
    for (const u of m[1].matchAll(/['"]([^'"]+)['"]/g)) out.push(resolve(dirname(file), u[1]));
  }
  return out.filter((f) => existsSync(f));
}

function issue7Files(): string[] {
  const files = new Set<string>();
  for (const dir of ISSUE_7_DIRS) for (const f of walk(resolve(appDir, dir))) files.add(f);
  for (const f of ISSUE_7_CHANGED) files.add(resolve(appDir, f));
  for (const entry of ISSUE_7_ENTRIES) for (const f of eagerGraph(resolve(appDir, entry))) files.add(f);
  for (const f of [...files]) if (f.endsWith('.ts')) for (const r of resourcesOf(f)) files.add(r);
  return [...files].filter((f) => /\.(ts|scss|html)$/.test(f) && !f.endsWith('.spec.ts') && f.startsWith(appDir));
}

function issue7Sources(): { rel: string; lines: string[] }[] {
  return issue7Files().map((f) => ({ rel: relative(appDir, f), lines: readFileSync(f, 'utf8').split('\n') }));
}

/** Comments blanked, line numbers kept (doc comments may name a font). */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function offenders(pattern: RegExp, prepare: (line: string) => string = (l) => l, code = false): string[] {
  const out: string[] = [];
  for (const { rel, lines: raw } of issue7Sources()) {
    const lines = code ? withoutComments(raw.join('\n')).split('\n') : raw;
    lines.forEach((line, i) => {
      if (pattern.test(prepare(line))) out.push(`${rel}:${i + 1}: ${raw[i].trim()}`);
    });
  }
  return out;
}

const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|box-shadow/;
const NAMED_COLOUR =
  /(^|[\s;{])(color|background(-color)?|border(-[a-z]+)*|outline(-color)?|fill)\s*:[^;]*\b(white|black|red|green|blue|gr[ae]y|orange|yellow|navy)\b/i;
const FRAMEWORK =
  /\beffect\(|\bafterNextRender\b|\bafterRender\b|\bviewChild\b|\bviewChildren\b|\bcontentChild(ren)?\b|\bNgTemplateOutlet\b|\bngTemplateOutlet\b|ReactiveFormsModule|\bFormControl\b|\bFormGroup\b|\bFormsModule\b|\bngModel\b|\btoObservable\b|withComponentInputBinding/;
const BARREL = /['"][./]*shared\/(ui|map)['"]|shared\/(ui|map)\/index/;

describe('issue #7 static checks (NC§W9.17)', () => {
  it('NC§W9.17 scope. the #7 file set holds the four views, the store, the places layer, the new components and the reached kit files', () => {
    const rels = issue7Files().map((f) => relative(appDir, f));
    for (const f of [
      'app-area/customer/home/home.page.ts',
      'app-area/customer/home/home.page.html',
      'app-area/customer/home/home.page.scss',
      'app-area/customer/new-task/task-draft.store.ts',
      'shared/places/google-place-search.ts',
      'shared/ui/place-field/place-field.component.ts',
      'shared/ui/card/card.component.ts',
      'shared/ui/overlay/dialog.component.ts',
      'shared/ui/field/field.component.scss',
      'shared/ui/status-chip/status-chip.component.ts',
      'shared/ui/states/error-state.component.ts',
      'shared/ui/notice/notice.component.ts',
      'shared/map/maps-loader.service.ts',
    ]) {
      expect.soft(rels, f).toContain(f);
    }
  });

  it('NC§W9.17(a). no hex, rgb(a), hsl(a), named colour, box-shadow or marketing variable in #7 code; the Google asset is the only excepted file', () => {
    expect(offenders(COLOUR)).toEqual([]);
    expect(offenders(NAMED_COLOUR, (l) => l.replace(/var\([^)]*\)/g, ''))).toEqual([]);
    expect(offenders(/var\(--(?!nitume-|nm-)[a-z]/)).toEqual([]);
    // The exception is the exact asset path, and the asset is Google's own file.
    const asset = readFileSync(resolve(srcDir, GOOGLE_ATTRIBUTION), 'utf8');
    expect(asset).toContain('<svg');
    const readme = readFileSync(resolve(srcDir, 'assets/third-party/README.md'), 'utf8');
    expect(readme).toContain('https://developers.google.com/static/maps/documentation/images/Google_Maps_Attribution_Assets.zip');
    const others = walk(resolve(srcDir, 'assets')).map((f) => relative(srcDir, f)).filter((f) => f.endsWith('.svg') && f !== GOOGLE_ATTRIBUTION && f.startsWith('assets/third-party/'));
    expect(others).toEqual([]);
  });

  it('NC§W9.17(b). no font-family and no Fira literal in #7 code (numbers only through nmNum and the num-* styles)', () => {
    expect(offenders(/font-family|Fira Code|Fira Sans/, (l) => l, true)).toEqual([]);
  });

  it('NC§W9.17(c). none of the WQ-33 framework features in #7 code; app.config.ts registers no withComponentInputBinding', () => {
    expect(offenders(FRAMEWORK)).toEqual([]);
    expect(readFileSync(resolve(srcDir, 'app.config.ts'), 'utf8')).not.toMatch(/withComponentInputBinding\(/);
  });

  it('NC§W9.17(d). no import from the shared/ui or shared/map barrel in #7 code', () => {
    const out: string[] = [];
    for (const f of issue7Files().filter((x) => x.endsWith('.ts'))) {
      for (const spec of staticSpecifiers(readFileSync(f, 'utf8'))) {
        const target = resolveModule(f, spec);
        const barrel = target !== null && /[\\/]app[\\/]shared[\\/](ui|map)[\\/]index\.ts$/.test(target);
        if (barrel || BARREL.test(`'${spec}'`)) out.push(`${relative(appDir, f)}: ${spec}`);
      }
    }
    expect(out).toEqual([]);
    // Nothing #7 imports @angular/google-maps.
    expect(offenders(/@angular\/google-maps/)).toEqual([]);
  });

  it('NC§W9.17(e). the eager graph from src/main.ts reaches no session, realtime, app-area, kit or places file', () => {
    const reached = [...eagerGraph(resolve(srcDir, 'main.ts'))].map((f) => relative(srcDir, f));
    expect(reached).toContain('app.config.ts');
    expect(reached.filter((f) => FORBIDDEN_EAGER.test(f))).toEqual([]);
  });

  it('NC§W9.17(e) walker check. an injected static import of shared/places/place-search.ts into app.routes.ts is reported', () => {
    const routesPath = resolve(appDir, 'app.routes.ts');
    const read = (file: string) => {
      const source = readFileSync(file, 'utf8');
      return file === routesPath ? `import { PLACE_SEARCH } from './shared/places/place-search';\n${source}` : source;
    };
    const reached = [...eagerGraph(resolve(srcDir, 'main.ts'), read)].map((f) => relative(srcDir, f));
    expect(reached.filter((f) => FORBIDDEN_EAGER.test(f))).toContain('app/shared/places/place-search.ts');
  });

  it('NC§W9.17(f). no bare outline: none / outline: 0 in #7 code', () => {
    expect(offenders(/outline:\s*(none|0)\b/)).toEqual([]);
  });

  it('NC§W9.17 style files. no @use, @include, @mixin or $ variable in inline styles of #7 code', () => {
    const out: string[] = [];
    for (const f of issue7Files().filter((x) => x.endsWith('.ts'))) {
      const source = readFileSync(f, 'utf8');
      for (const m of source.matchAll(/styles:\s*(\[[\s\S]*?\]|`[\s\S]*?`)/g)) {
        if (/@use|@include|@mixin|\$[a-zA-Z_-]/.test(m[1])) out.push(relative(appDir, f));
      }
    }
    expect(out).toEqual([]);
  });

  it('NC§W9.9 memory only. no localStorage or sessionStorage in the customer area (G7-3)', () => {
    const hits = walk(resolve(appDir, 'app-area/customer'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter((f) => /localStorage|sessionStorage/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(appDir, f));
    expect(hits).toEqual([]);
  });

  it('G7-13. no type style and no colour token added to _tokens.scss (the #6 map: 35 styles, 16 colours)', () => {
    const tokens = readFileSync(resolve(srcDir, 'styles/_tokens.scss'), 'utf8');
    const styles = tokens.slice(tokens.indexOf('$nm-type-styles: ('), tokens.indexOf(');', tokens.indexOf('$nm-type-styles: (')));
    expect(styles.match(/^\s+'[a-z0-9-]+':/gm)?.length).toBe(35);
    expect(tokens.match(/--nitume-(blue|white|slate|green|amber|red|scrim)[a-z0-9-]*:/g)?.length).toBe(16);
  });
});

describe('issue #8 static checks (A.T14, G8-39 and the gap report rg evidence)', () => {
  const sources = (dir: string) =>
    walk(resolve(appDir, dir))
      .filter((f) => /\.(ts|html)$/.test(f) && !f.endsWith('.spec.ts'))
      .map((f) => ({ rel: relative(appDir, f), text: readFileSync(f, 'utf8') }));
  const hits = (dir: string, pattern: RegExp, code = false) =>
    sources(dir)
      .filter((f) => pattern.test(code ? withoutComments(f.text) : f.text))
      .map((f) => f.rel);

  it('A.T14 scope. the #8 file set holds the pages, dialog, watcher, stores, API, the customer components, the four kit folders and the changed kit files', () => {
    const rels = issue7Files().map((f) => relative(appDir, f));
    for (const f of [
      'app-area/customer/checkout/awaiting-quote.page.ts',
      'app-area/customer/checkout/awaiting-quote.page.html',
      'app-area/customer/checkout/awaiting-quote.page.scss',
      'app-area/customer/checkout/payment.page.ts',
      'app-area/customer/checkout/merchant-payment.page.ts',
      'app-area/customer/checkout/merchant-payment.page.html',
      'app-area/customer/checkout/price-change-dialog.component.ts',
      'app-area/customer/checkout/price-change.watcher.ts',
      'app-area/customer/checkout/checkout-intent.store.ts',
      'app-area/customer/checkout/payment-attempt.store.ts',
      'app-area/customer/checkout/checkout-routing.ts',
      'app-area/customer/data/checkout.api.ts',
      'app-area/customer/deadline.ts',
      'app-area/customer/shared/stk-status.component.ts',
      'app-area/customer/shared/deadline-panel.component.ts',
      'shared/ui/radio-row/radio-row.component.ts',
      'shared/ui/payment-method-card/payment-method-card.component.ts',
      'shared/ui/copy-row/copy-row.component.ts',
      'shared/ui/pulsing-dots/pulsing-dots.component.scss',
      'shared/ui/overlay/panel.component.ts',
      'shared/ui/active-task-card/active-task-card.component.ts',
      'shared/ui/overlay/dialog.component.ts',
      'shared/ui/fixed-cta/fixed-cta.component.ts',
    ]) {
      expect.soft(rels, f).toContain(f);
    }
  });

  it('A.T14 (e) walker check. an injected static import of checkout.api.ts into app.routes.ts is reported', () => {
    const routesPath = resolve(appDir, 'app.routes.ts');
    const read = (file: string) => {
      const source = readFileSync(file, 'utf8');
      return file === routesPath ? `import { CheckoutApi } from './app-area/customer/data/checkout.api';\n${source}` : source;
    };
    const reached = [...eagerGraph(resolve(srcDir, 'main.ts'), read)].map((f) => relative(srcDir, f));
    expect(reached.filter((f) => FORBIDDEN_EAGER.test(f))).toContain('app/app-area/customer/data/checkout.api.ts');
  });

  it('G8-4 / G8-27. memory only: no storage, IndexedDB, cookie or history writes in the customer area; no beforeunload in the checkout', () => {
    expect(hits('app-area/customer', /localStorage|sessionStorage|indexedDB|document\.cookie|history\.(push|replace)State/)).toEqual([]);
    expect(hits('app-area/customer/checkout', /beforeunload/)).toEqual([]);
  });

  it('G8-6. no credentials flag or interceptor in the customer area; no quote component read; one errands/defaults call site', () => {
    expect(hits('app-area/customer', /withCredentials|HTTP_INTERCEPTORS|withInterceptors/)).toEqual([]);
    expect(hits('.', /baseFee|distanceFee|timeFee|urgencyFee|complexityFee|premiumFee/)).toEqual([]);
    // Call sites (code, not comments).
    expect(hits('.', /errands\/defaults/, true)).toEqual(['app-area/customer/data/errands.api.ts']);
  });

  it('G8-8. no errand merchant fields anywhere; Till / Paybill only in the checkout types and the merchant-payment page', () => {
    expect(hits('.', /merchantTillNumber|merchantPaybillNumber|merchantAccountReference/)).toEqual([]);
    expect(hits('app-area', /tillNumber|paybillNumber/).sort()).toEqual([
      'app-area/customer/checkout/merchant-payment.page.ts',
      'app-area/customer/data/checkout.api.ts',
    ]);
  });

  it('G8-9 / G8-21. one deadlineAt; zone offsets only in deadline.ts', () => {
    expect(hits('.', /function deadlineAt/)).toEqual(['app-area/customer/deadline.ts']);
    expect(hits('app-area/customer', /\+03:00|Africa\/Nairobi|getTimezoneOffset/)).toEqual(['app-area/customer/deadline.ts']);
  });

  it('G8-12. no float arithmetic on money values in the customer area or the format helpers', () => {
    const pattern = /parseFloat|Number\(.*(Fee|Amount|amount|total|budget|Price)/;
    expect([...hits('app-area/customer', pattern), ...hits('shared/format', pattern)]).toEqual([]);
  });

  it('G8-23. nm-stk-status is rendered by exactly the payment and merchant-payment pages', () => {
    expect(hits('.', /<nm-stk-status/).sort()).toEqual([
      'app-area/customer/checkout/merchant-payment.page.html',
      'app-area/customer/checkout/payment.page.ts',
    ]);
  });

  it('G8-33 / G8-35. KSh never KES; no wallet or escrow wording in the customer area and the kit', () => {
    expect(hits('app-area/customer', /KES\b/)).toEqual([]);
    expect([...hits('app-area/customer', /wallet|escrow/i), ...hits('shared', /wallet|escrow/i)]).toEqual([]);
  });

  it('G8-36 / G8-41. every new #8 component is OnPush; nothing under features/', () => {
    const files = [
      ...walk(resolve(appDir, 'app-area/customer/checkout')),
      ...walk(resolve(appDir, 'app-area/customer/shared')),
      ...['radio-row', 'payment-method-card', 'copy-row', 'pulsing-dots'].flatMap((d) => walk(resolve(appDir, 'shared/ui', d))),
    ].filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && /@Component\(/.test(readFileSync(f, 'utf8')));
    expect(files.length).toBeGreaterThanOrEqual(13);
    for (const f of files) expect.soft(readFileSync(f, 'utf8'), relative(appDir, f)).toContain('ChangeDetectionStrategy.OnPush');
    expect(existsSync(resolve(appDir, 'features'))).toBe(false);
  });
});
