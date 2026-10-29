// A.T9 and the other #8 kit additions (customer-x-awaiting-quote A§8; gap
// report G8-10 … G8-13). The #5, #6 and #7 spec files of the touched
// components stay unchanged and passing.
import { Component, TemplateRef, inject, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { addKes, compareKes, formatDeadlineEat, isPositiveKes, subtractKes } from './format/formatters';
import { NM_OVERLAY_DATA } from './ui/overlay/overlay-ref';
import { NmPanelService } from './ui/overlay/panel.service';
import { NmActiveTaskCard } from './ui/active-task-card/active-task-card.component';
import { NmIcon } from './ui/icon/icon.component';
import { NM_ICONS } from './ui/icon/icons';

const ICONS_8 = ['phone', 'check'] as const;

describe('#8 kit additions (A§8)', () => {
  describe('nm-icon phone and check (G8-10)', () => {
    it('A.T9 icons. phone and check resolve to Material paths and render as inline SVG', () => {
      @Component({ imports: [NmIcon], template: `@for (n of names; track n) { <nm-icon [name]="n" [size]="28" /> }` })
      class Host {
        readonly names = ICONS_8;
      }
      const fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      const icons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nm-icon'));
      expect(icons.map((i) => i.getAttribute('data-icon'))).toEqual([...ICONS_8]);
      for (const [i, name] of ICONS_8.entries()) {
        expect.soft(NM_ICONS[name], name).toMatch(/^M[\d.\-\s,a-zA-Z]+$/);
        expect.soft(icons[i].querySelector('path')?.getAttribute('d'), name).toBe(NM_ICONS[name]);
        expect.soft(icons[i].querySelector('svg')?.getAttribute('width'), name).toBe('28');
      }
    });
  });

  describe('nm-panel WQ-33 conversion (G8-11)', () => {
    afterEach(() => document.querySelectorAll('nm-panel').forEach((el) => el.remove()));

    it('A.T9 panel source. no NgTemplateOutlet, ngTemplateOutlet or viewChild; nmTemplateOutlet and NgComponentOutlet stay', () => {
      const source = readFileSync(resolve(process.cwd(), 'src/app/shared/ui/overlay/panel.component.ts'), 'utf8');
      expect(source).not.toMatch(/NgTemplateOutlet|ngTemplateOutlet|viewChild/);
      expect(source).toContain('nmTemplateOutlet');
      expect(source).toContain('NgComponentOutlet');
    });

    it('A.T9 panel content. a template gets the ref and data; a component gets NM_OVERLAY_DATA; focus moves to the title; the sheet traps Tab', async () => {
      const host = TestBed.createComponent(TemplateHost);
      host.detectChanges();
      const panels = TestBed.inject(NmPanelService);

      // Template content with its context.
      const ref = panels.open<string>(host.componentInstance.tpl(), { title: 'Deadline', data: { value: 'Today' } });
      const title = document.querySelector('nm-panel .nm-panel__title') as HTMLElement;
      expect(title.textContent).toBe('Deadline');
      expect(document.activeElement).toBe(title);
      const pick = document.querySelector('nm-panel .pick') as HTMLButtonElement;
      expect(pick.textContent).toBe('Today');
      pick.focus();
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      pick.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(pick);
      pick.click();
      await expect(ref.closed).resolves.toBe('Today');
      expect(document.querySelector('nm-panel')).toBeNull();

      // Component content with NM_OVERLAY_DATA; no title → the sheet takes focus.
      const second = panels.open(PanelBody, { data: { text: 'Saved' } });
      expect(document.querySelector('nm-panel app-panel-body .body')?.textContent).toBe('Saved');
      expect(document.activeElement).toBe(document.querySelector('nm-panel .nm-panel'));
      second.close();
      expect(document.querySelector('nm-panel')).toBeNull();
    });
  });

  describe('decimal money helpers (G8-12, WQ-27)', () => {
    it('A.T6 addKes. exact cents: 2200 + 40000, 0.10 + 0.20 without float drift, the largest values, mixed precision', () => {
      expect(addKes('2200.00', '40000.00')).toBe('42200.00');
      expect(addKes('0.10', '0.20')).toBe('0.30');
      expect(0.1 + 0.2).not.toBe(0.3); // the float result the helper avoids
      expect(addKes('99999999999.99', '0.01')).toBe('100000000000.00');
      expect(addKes('440', '660.5')).toBe('1100.50');
      expect(addKes('0', '0.00')).toBe('0.00');
      expect(addKes('-5.00', '2.50')).toBe('-2.50');
    });

    it('A.T6 subtractKes. 45000 − 40000.00 → 5000.00; negative results keep the sign; 0.50 differences are exact', () => {
      expect(subtractKes('45000', '40000.00')).toBe('5000.00');
      expect(subtractKes('40000.00', '45000.00')).toBe('-5000.00');
      expect(subtractKes('40000.50', '40000.00')).toBe('0.50');
      expect(subtractKes('0.30', '0.10')).toBe('0.20');
      expect(subtractKes('40000.00', '40000')).toBe('0.00');
    });

    it('A.T6 compareKes and isPositiveKes. −1/0/1 on cents; 0.00 and negatives are not positive', () => {
      expect(compareKes('45000.00', '40000.00')).toBe(1);
      expect(compareKes('40000', '40000.00')).toBe(0);
      expect(compareKes('39999.99', '40000.00')).toBe(-1);
      expect(compareKes('-1.00', '0.00')).toBe(-1);
      expect(isPositiveKes('0.00')).toBe(false);
      expect(isPositiveKes('0')).toBe(false);
      expect(isPositiveKes('-0.01')).toBe(false);
      expect(isPositiveKes('0.01')).toBe(true);
      expect(isPositiveKes('40000.00')).toBe(true);
    });

    it('A.T6 non-numeric. every helper throws on a non-numeric string', () => {
      expect(() => addKes('abc', '1.00')).toThrow();
      expect(() => subtractKes('1.00', '')).toThrow();
      expect(() => compareKes('1.00', 'NaN')).toThrow();
      expect(() => isPositiveKes('12a')).toThrow();
    });
  });

  describe('formatDeadlineEat hour24 (owner Q8-3)', () => {
    it('Q8-3. { hour24: true } → `Today, 23:59` / `Tomorrow, 23:59` on EAT days, identical in London and Nairobi; the default stays 12-hour', () => {
      const original = process.env['TZ'];
      try {
        for (const zone of ['Europe/London', 'Africa/Nairobi']) {
          process.env['TZ'] = zone;
          const now = new Date('2026-11-01T07:00:00.000Z'); // 10:00 EAT
          expect.soft(formatDeadlineEat('2026-11-01T20:59:00.000Z', now, { hour24: true }), zone).toBe('Today, 23:59');
          expect.soft(formatDeadlineEat('2026-11-02T20:59:00.000Z', now, { hour24: true }), zone).toBe('Tomorrow, 23:59');
          expect.soft(formatDeadlineEat('2026-11-01T06:05:00.000Z', now, { hour24: true }), zone).toBe('Today, 09:05');
          expect.soft(formatDeadlineEat('2026-11-05T20:59:00.000Z', now, { hour24: true }), zone).toBe('5 Nov, 23:59');
          // 21:30 London on 1 Nov is already 2 Nov in EAT.
          const late = new Date('2026-11-01T21:30:00.000Z');
          expect.soft(formatDeadlineEat('2026-11-02T20:59:00.000Z', late, { hour24: true }), zone).toBe('Today, 23:59');
          expect.soft(formatDeadlineEat('2026-11-01T20:59:00.000Z', now), zone).toBe('Today, 11:59 PM');
        }
      } finally {
        if (original === undefined) delete process.env['TZ'];
        else process.env['TZ'] = original;
      }
    });
  });

  describe('nm-active-task-card followed (G8-13)', () => {
    @Component({
      imports: [NmActiveTaskCard],
      template: `<nm-active-task-card
        category="Buy For Me"
        reference="NT-10482"
        title="Groceries"
        meta="Pay to confirm your task"
        actionLabel="Pay now →"
        actionHref="/app/customer/tasks/e-1/payment"
        (followed)="log.push('followed')"
      />`,
    })
    class Host {
      readonly log: string[] = [];
    }

    function setup() {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      const log = fixture.componentInstance.log;
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(async () => {
        log.push('navigate');
        return true;
      });
      const link = (fixture.nativeElement as HTMLElement).querySelector('a.nm-btn') as HTMLAnchorElement;
      return { log, navigate, link };
    }

    it('A.T8 card. a plain left click emits followed before the router navigates', () => {
      const { log, link } = setup();
      link.click();
      expect(log).toEqual(['followed', 'navigate']);
    });

    it('A.T8 card. Ctrl, Meta, Shift and middle clicks emit nothing and leave the browser to open the link', () => {
      const { log, navigate, link } = setup();
      for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
        link.dispatchEvent(event);
        expect.soft(event.defaultPrevented, JSON.stringify(init)).toBe(false);
      }
      expect(log).toEqual([]);
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});

@Component({
  template: `<ng-template #t let-ref let-data="data"
    ><button type="button" class="pick" (click)="ref.close(data.value)">{{ data.value }}</button></ng-template
  >`,
})
class TemplateHost {
  readonly tpl = viewChild.required<TemplateRef<unknown>>('t');
}

@Component({ selector: 'app-panel-body', template: `<p class="body">{{ data.text }}</p>` })
class PanelBody {
  protected readonly data = inject(NM_OVERLAY_DATA) as { text: string };
}
