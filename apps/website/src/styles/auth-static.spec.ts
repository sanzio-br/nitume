// Static checks for the issue #6 files (auth-foundation §9.9 F9.48, F9.49;
// gap report G6-40, G6-42). Outside src/app/ on purpose: the patterns below
// would trip the #5 raw-colour scan of src/app/.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const srcDir = resolve(process.cwd(), 'src');
const appDir = resolve(srcDir, 'app');

/** WQ-33 / §9.9 item 50: never statically reachable from src/main.ts. */
const FORBIDDEN_EAGER = /^app\/(core\/auth|core\/realtime|app-area|shared\/ui)\//;

/** Relative module specifiers of static imports and re-exports (not `import()`, not type-only). */
function staticSpecifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const out: string[] = [];
  for (const m of code.matchAll(/^\s*(import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
    if (m[2]) continue; // import type / export type
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

/** Files reached from `entry` through static imports and re-exports. */
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

/** Every #6 folder (frame, session layer, chooser, new kit components). */
const ISSUE_6_DIRS = [
  'app-area',
  'core/auth',
  'core/lazy-session',
  'pages/auth-chooser',
  'shared/ui/icon',
  'shared/ui/wordmark',
  'shared/ui/back-button',
  'shared/ui/pushed-header',
  'shared/ui/top-bar',
  'shared/ui/auth-frame',
  'shared/ui/otp-field',
  'shared/ui/otp-resend-line',
  'shared/ui/legal-line',
  'shared/ui/app-nav',
  'shared/ui/app-shell',
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function issue6Sources(): { rel: string; lines: string[] }[] {
  return ISSUE_6_DIRS.flatMap((d) => walk(resolve(appDir, d)))
    .filter((f) => /\.(ts|scss|html)$/.test(f) && !f.endsWith('.spec.ts'))
    .map((f) => ({ rel: relative(appDir, f), lines: readFileSync(f, 'utf8').split('\n') }));
}

function offenders(pattern: RegExp, prepare: (line: string) => string = (l) => l): string[] {
  const out: string[] = [];
  for (const { rel, lines } of issue6Sources()) {
    lines.forEach((line, i) => {
      if (pattern.test(prepare(line))) out.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  return out;
}

describe('issue #6 static checks', () => {
  it('F9.48. no hex, rgb(a), hsl(a), named colour, box-shadow or marketing variable in #6 files', () => {
    expect(offenders(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|box-shadow/)).toEqual([]);
    const namedColour =
      /(^|[\s;{])(color|background(-color)?|border(-[a-z]+)*|outline(-color)?|fill)\s*:[^;]*\b(white|black|red|green|blue|gr[ae]y|orange|yellow|navy)\b/i;
    expect(offenders(namedColour, (l) => l.replace(/var\([^)]*\)/g, ''))).toEqual([]);
    // Colours come only from the --nitume-* tokens (never the marketing --blue …).
    expect(offenders(/var\(--(?!nitume-|nm-)[a-z]/)).toEqual([]);
  });

  it('F9.49. no font-family and no Fira Code literal in #6 files (numbers only through nmNum and num-* styles)', () => {
    expect(offenders(/font-family|Fira Code|Fira Sans/)).toEqual([]);
  });

  it('G6-42. no bare outline: none / outline: 0 in #6 files', () => {
    expect(offenders(/outline:\s*(none|0)\b/)).toEqual([]);
  });

  it('F9.50. the eager import graph from src/main.ts reaches no session, realtime, app-area or kit file (WQ-33)', () => {
    const reached = [...eagerGraph(resolve(srcDir, 'main.ts'))].map((f) => relative(srcDir, f));
    expect(reached).toContain('app.config.ts');
    expect(reached).toContain('app/core/lazy-session/lazy-session.ts');
    expect(reached.filter((f) => FORBIDDEN_EAGER.test(f))).toEqual([]);
    // SessionStore loads RealtimeService on demand.
    const store = readFileSync(resolve(appDir, 'core/auth/session.store.ts'), 'utf8');
    expect(store).not.toMatch(/^import .*realtime/m);
    expect(store).toContain("await import('../realtime/realtime.service')");
  });

  it('F9.50 (walker check). a static import of session.store in app.config.ts is reported', () => {
    const configPath = resolve(srcDir, 'app.config.ts');
    const read = (file: string) => {
      const source = readFileSync(file, 'utf8');
      return file === configPath
        ? `import { SessionStore } from './app/core/auth/session.store';\n${source}`
        : source;
    };
    const reached = [...eagerGraph(resolve(srcDir, 'main.ts'), read)].map((f) => relative(srcDir, f));
    expect(reached.filter((f) => FORBIDDEN_EAGER.test(f))).toContain('app/core/auth/session.store.ts');
  });

  it('F9.60. no inline component styles under src/app/ contain @use, @include, @mixin or a $ variable', () => {
    // angular.json sets no inlineStyleLanguage: inline styles are plain CSS.
    const out: string[] = [];
    for (const file of walk(appDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/styles:\s*(\[[\s\S]*?\]|`[\s\S]*?`)/g)) {
        if (/@use|@include|@mixin|\$[a-zA-Z_-]/.test(m[1])) out.push(relative(appDir, file));
      }
    }
    expect(out).toEqual([]);
  });
});

