/** Environment surface for the Nitume admin app (apps/admin). Consumed by
 * the ApiClient to build absolute request URLs. Overridable at runtime via
 * `API_BASE` window global (useful when the dashboard is served from a
 * different origin than the NestJS API in local dev/prod), else falls back
 * to the compiled default. */
export interface Environment {
  /** NestJS API origin, WITHOUT trailing slash — e.g. http://localhost:3000. */
  apiBaseUrl: string;
}

export const environment: Environment = {
  apiBaseUrl: 'http://localhost:3000',
};
