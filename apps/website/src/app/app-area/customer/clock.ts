// The customer views' clock (browser local time, WQ-2 parity default). A
// token so tests inject a fixed time.
import { InjectionToken } from '@angular/core';

export const CUSTOMER_NOW = new InjectionToken<() => Date>('CUSTOMER_NOW', {
  providedIn: 'root',
  factory: () => () => new Date(),
});
