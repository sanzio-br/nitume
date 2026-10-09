import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, errandFixture, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import {
  buildMerchantBody,
  MerchantDetailsSectionComponent,
  merchantEditable,
  MerchantForm,
  NAME_ERROR,
  NOT_APPLICABLE_COPY,
  PAYBILL_ERROR,
  savedCopy,
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

  it('other categories with legacy details: read-only with the explanation (row 80)', () => {
    const fixture = render({
      category: 'inspection',
      status: 'QUOTED',
      merchantName: 'Naivas',
      merchantTillNumber: '5123456',
    });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(NOT_APPLICABLE_COPY);
    expect(el.textContent).toContain('5123456');
    expect(button(el, 'Edit')).toBeUndefined();
  });

  it('Buy For Me and Get It For Me stay editable without the explanation', () => {
    for (const category of ['buy_for_me', 'pickup_delivery']) {
      const el = render({ category, status: 'QUOTED' }).nativeElement as HTMLElement;
      expect(button(el, 'Add merchant details')).toBeDefined();
      expect(el.textContent).not.toContain(NOT_APPLICABLE_COPY);
    }
  });

  it('warns before changing details after payment, with the new copy', () => {
    const fixture = render({
      status: 'IN_PROGRESS',
      merchantName: 'Naivas',
      merchantTillNumber: '5123456',
    });
    const el = fixture.nativeElement as HTMLElement;
    button(el, 'Edit')!.click();
    fixture.detectChanges();
    const till = el.querySelectorAll('input')[1];
    till.value = '5123457';
    till.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button(el, 'Save details')!.click();
    fixture.detectChanges();
    expect(el.textContent?.replace(/\s+/g, ' ')).toContain(
      "The customer may already be paying the current Till 5123456. If they've started paying the merchant, we'll tell them the details changed so they check before paying.",
    );
  });

  it('400 merchant_details_not_applicable switches to read-only', async () => {
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
    button(el, 'Save details')!.click();
    http
      .expectOne(`${API}/errands/${errandFixture().id}/merchant-details`)
      .flush(
        { statusCode: 400, code: 'merchant_details_not_applicable', message: 'x' },
        { status: 400, statusText: 'Bad Request' },
      );
    await flushAsync();
    fixture.detectChanges();
    expect(el.textContent).toContain(NOT_APPLICABLE_COPY);
    expect(el.querySelector('input')).toBeNull();
    expect(button(el, 'Add merchant details')).toBeUndefined();
  });
});

describe('merchant details rules (row 80)', () => {
  it('editable only for the two categories in a non-terminal state', () => {
    expect(merchantEditable(errandFixture({ category: 'buy_for_me' }))).toBe(true);
    expect(merchantEditable(errandFixture({ category: 'pickup_delivery' }))).toBe(true);
    expect(merchantEditable(errandFixture({ category: 'queue_admin' }))).toBe(false);
    expect(merchantEditable(errandFixture({ status: 'SETTLED' }))).toBe(false);
  });

  it('tells the admin the customer was warned only when the API recorded the change', () => {
    const e = errandFixture();
    expect(savedCopy(false, true, { ...e, merchantDetailsUpdatedAt: '2026-10-08T09:00:00Z' })).toBe(
      "Merchant details updated. If the customer had started paying the merchant, they've been told to check them.",
    );
    expect(savedCopy(false, true, e)).toBe('Merchant details updated.');
    expect(savedCopy(false, false, { ...e, merchantDetailsUpdatedAt: 'x' })).toBe(
      'Merchant details updated.',
    );
  });
});
