// Static checks for the issue #6 files (auth-foundation §9.9 F9.48, F9.49;
// gap report G6-40, G6-42). Outside src/app/ on purpose: the patterns below
// would trip the #5 raw-colour scan of src/app/.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const appDir = resolve(process.cwd(), 'src/app');

/** Every #6 folder (frame, session layer, chooser, new kit components). */
const ISSUE_6_DIRS = [
  'app-area',
  'core/auth',
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
});
