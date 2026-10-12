import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Errand } from '../core/api-types';

export const API = 'http://localhost:3000/api/v1';

/** TestBed with a mocked HttpClient. */
export function setupHttp(): HttpTestingController {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return TestBed.inject(HttpTestingController);
}

/** Lets pending promises (store awaits) settle. */
export async function flushAsync(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

export function errandFixture(patch: Partial<Errand> = {}): Errand {
  return {
    id: '11111111-2222-3333-4444-555555510482',
    customerId: 'cccccccc-0000-0000-0000-00000000a1b2',
    category: 'buy_for_me',
    description: 'Buy groceries at Naivas',
    status: 'QUOTED',
    budget: '2000.00',
    quotedPrice: '1450.00',
    createdAt: '2026-10-08T06:00:00Z',
    updatedAt: '2026-10-08T06:00:00Z',
    ...patch,
  };
}

export function httpError(status: number, body: Record<string, unknown> | null = null) {
  return { status, statusText: 'Error', body };
}

/**
 * Switches the process (browser) time zone to `tz` and back, so tests prove
 * a time is shown in EAT and not the local zone (row 96). Use as
 * `beforeAll(zone.pin); afterAll(zone.restore);`.
 */
export function timeZoneSwitch(tz: string): { pin: () => void; restore: () => void } {
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
    .process.env;
  const saved = env['TZ'];
  return {
    pin: () => {
      env['TZ'] = tz;
    },
    restore: () => {
      if (saved === undefined) delete env['TZ'];
      else env['TZ'] = saved;
    },
  };
}
