import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageViewerComponent } from './image-viewer.component';
import { OpsDrawerComponent } from './ops-drawer.component';

@Component({
  imports: [ImageViewerComponent],
  template: `
    <button type="button" id="opener" (click)="open.set(true)">Open</button>
    @if (open()) {
      <app-image-viewer
        [src]="src()"
        label="National ID · Front · Mercy W."
        alt="National ID · Front for Mercy W."
        (closed)="closed()"
      />
    }
  `,
})
class HostComponent {
  readonly open = signal(false);
  readonly src = signal<string | null>('https://signed.example/front');
  closes = 0;
  closed(): void {
    this.closes++;
    this.open.set(false);
  }
}

describe('ImageViewerComponent (A-17)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let opener: HTMLButtonElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.autoDetectChanges();
    document.body.appendChild(fixture.nativeElement);
    opener = fixture.nativeElement.querySelector('#opener');
    opener.focus();
    opener.click();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    (fixture.nativeElement as HTMLElement).remove();
  });

  const viewer = () => document.querySelector<HTMLElement>('.image-viewer');

  it('covers the page from <body> with the image, header and ✕, and no download control', () => {
    const host = document.querySelector('app-image-viewer')!;
    expect(host.parentElement).toBe(document.body);
    const v = viewer()!;
    expect(v.getAttribute('role')).toBe('dialog');
    expect(v.getAttribute('aria-modal')).toBe('true');
    expect(v.querySelector('.image-viewer-head')?.textContent).toContain(
      'National ID · Front · Mercy W.',
    );
    const img = v.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://signed.example/front');
    expect(img.getAttribute('alt')).toBe('National ID · Front for Mercy W.');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(v.querySelector('a')).toBeNull();
    expect(v.querySelector('[download]')).toBeNull();
    expect(v.querySelectorAll('button').length).toBe(1);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
  });

  it('shows Loading image… while there is no link', async () => {
    fixture.componentInstance.src.set(null);
    await fixture.whenStable();
    expect(viewer()?.querySelector('img')).toBeNull();
    expect(viewer()?.textContent).toContain('Loading image…');
  });

  it('closes on ESC without reaching document listeners, and returns focus', async () => {
    const other = vi.fn();
    document.addEventListener('keydown', other);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.removeEventListener('keydown', other);
    await fixture.whenStable();
    expect(other).not.toHaveBeenCalled();
    expect(fixture.componentInstance.closes).toBe(1);
    expect(document.querySelector('app-image-viewer')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on ✕ and on the scrim, but not on the image', async () => {
    viewer()!.querySelector('img')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.closes).toBe(0);
    viewer()!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.closes).toBe(1);

    opener.click();
    await fixture.whenStable();
    viewer()!.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.closes).toBe(2);
  });

  it('keeps Tab on ✕', () => {
    const close = viewer()!.querySelector<HTMLButtonElement>('button')!;
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    close.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
  });
});

@Component({
  imports: [OpsDrawerComponent],
  template: `<app-ops-drawer [open]="open()" title="Verification documents" />`,
})
class DrawerHostComponent {
  readonly open = signal(false);
}

describe('OpsDrawerComponent initial focus (A-01, row 278)', () => {
  it('moves focus to ✕ when the drawer opens', async () => {
    const fixture = TestBed.createComponent(DrawerHostComponent);
    fixture.autoDetectChanges();
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('aria-label')).not.toBe('Close');
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    expect(document.activeElement?.classList.contains('drawer-close')).toBe(true);
    fixture.destroy();
    (fixture.nativeElement as HTMLElement).remove();
  });
});
