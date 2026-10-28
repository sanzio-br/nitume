// Spec-only typings for the few Node APIs the kit's static tests use
// (`_tokens.scss` values, raw-colour scan). Excluded from the app build.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
  export function existsSync(path: string): boolean;
}
declare module 'node:path' {
  export function resolve(...parts: string[]): string;
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
}
declare const process: { cwd(): string; env: Record<string, string | undefined> };
