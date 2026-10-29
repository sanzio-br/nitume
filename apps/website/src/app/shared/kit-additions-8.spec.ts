// A.T9 and the other #8 kit additions (customer-x-awaiting-quote A§8; gap
// report G8-10 … G8-13). The #5, #6 and #7 spec files of the touched
// components stay unchanged and passing.
import { Component, TemplateRef, inject, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NM_OVERLAY_DATA } from './ui/overlay/overlay-ref';
import { NmPanelService } from './ui/overlay/panel.service';
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
