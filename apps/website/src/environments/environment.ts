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
  /**
   * Terms, privacy and support links of the signed-in app (auth-foundation
   * §8; the apps' NITUME_TERMS_URL, NITUME_PRIVACY_URL, NITUME_SUPPORT_URI).
   * Empty in git; set per deployment. Empty → words as plain text / no
   * `Contact support` link. Only http(s):, mailto: and tel: are rendered.
   */
  links: {
    customer: AppLinks;
    runner: AppLinks;
  };
}

export interface AppLinks {
  termsUrl: string;
  privacyUrl: string;
  supportUrl: string;
}

export const environment: Environment = {
  apiBaseUrl: 'http://localhost:3000',
  mapsApiKey: '',
  links: {
    customer: { termsUrl: '', privacyUrl: '', supportUrl: '' },
    runner: { termsUrl: '', privacyUrl: '', supportUrl: '' },
  },
};
