// Re-export (issue #6, WQ-33): the two session-facing tokens are declared in
// core/lazy-session so the eager app config never reaches core/realtime.
export { REALTIME_ACCOUNT_SUSPENDED, REALTIME_TOKEN_PROVIDER } from '../lazy-session/realtime-session.tokens';
