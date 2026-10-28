// Template for the git-ignored `environment.local.ts`.
//
//   cp environment.local.example.ts environment.local.ts
//   # put the referrer-restricted Maps JavaScript API browser key below
//   ng serve -c local      (or: ng build -c local)
//
// The `local` configuration swaps environment.ts for environment.local.ts
// (angular.json fileReplacements). Never commit a key: not in source,
// tests, docs or commit messages. The shape must match `Environment` in
// environment.ts (self-contained: this file replaces it when swapped in).

export interface Environment {
  apiBaseUrl: string;
  mapsApiKey: string;
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
