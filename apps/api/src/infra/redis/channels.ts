/**
 * Redis pub/sub channel names (§4.2). Build the full name with
 * `RedisService.channel()` so the configured key prefix applies.
 */

/** `location:errand:{errandId}`: one live position of the errand's runner. */
export const locationChannel = (errandId: string): string => `location:errand:${errandId}`;

/** PSUBSCRIBE pattern matching every `locationChannel`. */
export const LOCATION_CHANNEL_PATTERN = 'location:errand:*';
