export interface Environment {
  /** NestJS API origin, WITHOUT trailing slash — e.g. http://localhost:3000. */
  apiBaseUrl: string;
  /**
   * Google Maps JavaScript API browser key. Always empty in git: a local key
   * goes in the git-ignored `environment.local.ts` (see
   * `environment.local.example.ts`, `ng serve -c local`). Empty → the live
   * map shows its placeholder (WQ-1).
   */
  mapsApiKey: string;
}

export const environment: Environment = {
  apiBaseUrl: 'http://localhost:3000',
  mapsApiKey: '',
};
