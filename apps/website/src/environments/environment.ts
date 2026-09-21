export interface Environment {
  /** NestJS API origin, WITHOUT trailing slash — e.g. http://localhost:3000. */
  apiBaseUrl: string;
}

export const environment: Environment = {
  apiBaseUrl: 'http://localhost:3000',
};