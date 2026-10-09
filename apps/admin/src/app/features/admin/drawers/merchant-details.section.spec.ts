import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, errandFixture, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import {
  buildMerchantBody,
  MerchantDetailsSectionComponent,
  MerchantForm,
  NAME_ERROR,
  PAYBILL_ERROR,
  showsMerchantSection,
  TILL_ERROR,
  validateMerchantForm,
} from './merchant-details.section';
import { AdminDataService } from '../admin-data.service';

const base: MerchantForm = {
  name: 'Naivas Westlands',
  type: 'till',
  till: '5123456',
  paybill: '247247',
  account: 'ACC-9',
};

describe('merchant details body (G-4)', () => {
  it('sends only the Till for a Till, never the Paybill or account', () => {
    expect(buildMerchantBody(base)).toEqual({
      merchantName: 'Naivas Westlands',
      tillNumber: '5123456',
    });
  });

  it('sends Paybill + account for a Paybill, never the Till', () => {
    expect(buildMerchantBody({ ...base, type: 'paybill' })).toEqual({
      merchantName: 'Naivas Westlands',
      paybillNumber: '247247',
      accountReference: 'ACC-9',
    });
  });

  it('omits an empty account reference', () => {
    const body = buildMerchantBody({ ...base, type: 'paybill', account: '  ' });
    expect(body).toEqual({ merchantName: 'Naivas Westlands', paybillNumber: '247247' });
  });

  it('trims the name', () => {
    expect(buildMerchantBody({ ...base, name: '  Naivas  ' }).merchantName).toBe('Naivas');
  });
});

describe('merchant details validation', () => {
  it('accepts a valid form', () => {
    expect(validateMerchantForm(base)).toEqual({});
  });

  it('checks the name length', () => {
    expect(validateMerchantForm({ ...base, name: ' A ' }).name).toBe(NAME_ERROR);
  });

  it('checks 5-10 digits for the selected number only', () => {
    expect(validateMerchantForm({ ...base, till: '1234' }).till).toBe(TILL_ERROR);
    expect(validateMerchantForm({ ...base, till: '12345678901' }).till).toBe(TILL_ERROR);
    expect(validateMerchantForm({ ...base, till: '12a45' }).till).toBe(TILL_ERROR);
    // An invalid Paybill doesn't matter while Till is selected.
    expect(validateMerchantForm({ ...base, paybill: 'x' })).toEqual({});
    expect(validateMerchantForm({ ...base, type: 'paybill', paybill: 'x' }).paybill).toBe(
      PAYBILL_ERROR,
    );
  });
});

describe('when the section shows (AQ-4 default)', () => {
  it('shows for Buy For Me and Get It For Me', () => {
    expect(showsMerchantSection(errandFixture({ category: 'buy_for_me' }))).toBe(true);
    expect(showsMerchantSection(errandFixture({ category: 'pickup_delivery' }))).toBe(true);
    expect(showsMerchantSection(errandFixture({ category: 'inspection' }))).toBe(false);
  });

  it('shows for any errand that already has details', () => {
    expect(
      showsMerchantSection(errandFixture({ category: 'inspection', merchantTillNumber: '12345' })),
    ).toBe(true);
  });
});

describe('MerchantDetailsSectionComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  function render(patch = {}) {
    const fixture = TestBed.createComponent(MerchantDetailsSectionComponent);
    fixture.componentRef.setInput('errand', errandFixture(patch));
    fixture.detectChanges();
    return fixture;
  }
  const button = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as
      HTMLButtonElement | undefined;

  it('is read-only in terminal states (no Add or Edit)', () => {
    for (const status of ['SETTLED', 'CANCELLED', 'FAILED', 'EXPIRED'] as const) {
      const empty = render({ status });
      expect(button(empty.nativeElement, 'Add merchant details')).toBeUndefined();
      const set = render({ status, merchantName: 'Naivas', merchantTillNumber: '5123456' });
      expect(button(set.nativeElement, 'Edit')).toBeUndefined();
      expect(set.nativeElement.textContent).toContain('5123456');
    }
  });

  it('stays editable at COMPLETED (not the store TERMINAL list)', () => {
    const fixture = render({ status: 'COMPLETED' });
    expect(button(fixture.nativeElement, 'Add merchant details')).toBeDefined();
  });

  it('saves a Till with a PUT and patches the errand', async () => {
    const s = TestBed.inject(AdminDataService);
    const e = errandFixture({ status: 'QUOTED' });
    s.detail.set(e);
    const fixture = render({ status: 'QUOTED' });
    const el = fixture.nativeElement as HTMLElement;
    button(el, 'Add merchant details')!.click();
    fixture.detectChanges();
    const inputs = el.querySelectorAll('input');
    inputs[0].value = 'Naivas';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = '5123456';
    inputs[1].dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const save = button(el, 'Save details')!;
    expect(save.disabled).toBe(false);
    save.click();
    const req = http.expectOne(`${API}/errands/${e.id}/merchant-details`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ merchantName: 'Naivas', tillNumber: '5123456' });
    req.flush({ ...e, merchantName: 'Naivas', merchantTillNumber: '5123456' });
    await flushAsync();
    fixture.detectChanges();
    expect(s.detail()?.merchantTillNumber).toBe('5123456');
    expect(el.textContent).toContain(
      'Merchant details saved. The customer can now pay the merchant directly.',
    );
  });
});
