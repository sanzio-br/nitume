// Static checks for the signed-in app token layer (ui-kit spec §2, §12.1).
// Lives outside src/app/ on purpose: the reference table below holds the
// exact design-system values, which the raw-colour scan (case 2) forbids
// anywhere under src/app/.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd(); // apps/website
const tokensPath = resolve(root, 'src/styles/_tokens.scss');

/** §2.2, §2.3, §2.5, §2.6, §2.7: every property and its exact value. */
const EXPECTED_TOKENS: Record<string, string> = {
  '--nitume-blue': '#0B2545',
  '--nitume-white': '#FFFFFF',
  '--nitume-slate': '#F4F6F9',
  '--nitume-green': '#04AF4D',
  '--nitume-blue-700': '#08192F',
  '--nitume-blue-050': '#E9EDF3',
  '--nitume-slate-line': '#E2E7EF',
  '--nitume-slate-600': '#5C6B85',
  '--nitume-slate-400': '#8C97AC',
  '--nitume-green-050': '#E3F8EA',
  '--nitume-green-700': '#038A3D',
  '--nitume-amber': '#B8860B',
  '--nitume-amber-050': '#FBF3E1',
  '--nitume-red': '#C1433C',
  '--nitume-red-050': '#FBEAE9',
  '--nitume-scrim': 'rgba(11, 37, 69, 0.5)',
  '--nitume-font-ui': "'Fira Sans', system-ui, sans-serif",
  '--nitume-font-num': "'Fira Code', ui-monospace, monospace",
  '--nitume-space-xs': '4px',
  '--nitume-space-sm': '8px',
  '--nitume-space-md': '16px',
  '--nitume-space-lg': '24px',
  '--nitume-space-xl': '32px',
  '--nitume-space-screen': '20px',
  '--nitume-tap': '48px',
  '--nitume-r-s': '8px',
  '--nitume-r-m': '14px',
  '--nitume-r-l': '20px',
  '--nitume-r-pill': '999px',
  '--nitume-content-max': '1180px',
};

const COLOUR_TOKENS = Object.keys(EXPECTED_TOKENS).filter(
  (k) => !/--nitume-(font|space|tap|r-|content)/.test(k),
);

/** Marketing :root variables as on main (WQ-5: unchanged). */
const MARKETING_VARS: Record<string, string> = {
  '--blue': '#0B2545',
  '--blue-700': '#08192F',
  '--blue-050': '#E9EDF3',
  '--white': '#FFFFFF',
  '--slate': '#F4F6F9',
  '--slate-line': '#E2E7EF',
  '--slate-600': '#5C6B85',
  '--slate-400': '#8C97AC',
  '--green': '#04AF4D',
  '--green-700': '#038A3D',
  '--green-050': '#E3F8EA',
  '--amber': '#B8860B',
  '--amber-050': '#FBF3E1',
  '--red': '#C1433C',
  '--red-050': '#FBEAE9',
  '--r-s': '8px',
  '--r-m': '14px',
  '--r-l': '22px',
};

/** Marketing paths excluded from the raw-colour scan (§1, §11). */
const MARKETING_PATHS = [
  'pages/',
  'shared/header/',
  'shared/footer/',
  'shared/category-card/',
  'shared/profile-card/',
  'shared/proof-item/',
  'shared/ticket/',
];

function declarations(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

interface SassModule {
  compileString(
    source: string,
    options: { loadPaths: string[]; style: 'expanded' },
  ): { css: string };
}

describe('token layer (§12.1)', () => {
  it('1. _tokens.scss compiles and declares every §2 property with the exact value', async () => {
    // Non-literal specifier: resolved by Node at run time, not bundled.
    const specifier = 'sass';
    const sass = (await import(/* @vite-ignore */ specifier)) as SassModule;
    const { css } = sass.compileString("@use 'tokens';", {
      loadPaths: [resolve(root, 'src/styles')],
      style: 'expanded',
    });
    const compiled = declarations(css);

    for (const [name, value] of Object.entries(EXPECTED_TOKENS)) {
      expect.soft(compiled.get(name), name).toBe(value);
    }
    // Exactly these 16 colour tokens: no neutral, no grey, nothing extra.
    const compiledColours = [...compiled.keys()].filter(
      (k) => !/--nitume-(font|space|tap|r-|content)/.test(k),
    );
    expect(compiledColours.sort()).toEqual([...COLOUR_TOKENS].sort());
    expect(compiled.size).toBe(Object.keys(EXPECTED_TOKENS).length);

    // Component load (mixins only) emits no :root block.
    const quiet = sass.compileString(
      "@use 'tokens' as * with ($nm-emit-root: false); .x { @include nm-type(num-meta); }",
      { loadPaths: [resolve(root, 'src/styles')], style: 'expanded' },
    ).css;
    expect(quiet).not.toContain(':root');
    expect(quiet).toContain('font-family: var(--nitume-font-num)');
    expect(quiet).toContain('font-size: 11px');
    expect(quiet).toContain('color: var(--nitume-slate-600)');
  });

  it('2. no raw colour or box-shadow under src/app/ outside marketing files', () => {
    const appDir = resolve(root, 'src/app');
    const forbidden = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|box-shadow/;
    const offenders: string[] = [];
    for (const file of walk(appDir)) {
      const rel = relative(appDir, file).split('\\').join('/');
      if (MARKETING_PATHS.some((p) => rel.startsWith(p))) continue;
      if (!/\.(ts|html|scss|css)$/.test(rel)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (forbidden.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
    // The token file is the one place colours live.
    expect(readFileSync(tokensPath, 'utf8')).toMatch(forbidden);
  });

  it('3. styles.scss keeps the marketing variables unchanged and only adds the token @use', () => {
    const source = readFileSync(resolve(root, 'src/styles.scss'), 'utf8');
    expect(source.split('\n')[0]).toBe("@use 'styles/tokens';");
    const vars = declarations(source);
    for (const [name, value] of Object.entries(MARKETING_VARS)) {
      expect.soft(vars.get(name), name).toBe(value);
    }
    // No --nitume-* token is redefined in the marketing stylesheet.
    expect([...vars.keys()].filter((k) => k.startsWith('--nitume-'))).toEqual([]);
  });
});
