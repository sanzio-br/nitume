// H T4 at component level and the G7-28 minimum for `nm-search-entry`.
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { cssRuleValues, declared, tokensOnly } from '../../../../testing/css';
import { NmSearchEntry } from './search-entry.component';

@Component({
  imports: [NmSearchEntry],
  template: `<nm-search-entry href="/app/customer/new" placeholder="What do you need done?" />`,
})
class Host {}

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { root, link: root.querySelector('a.nm-search-entry') as HTMLAnchorElement };
}

describe('nm-search-entry (G7-22)', () => {
  it('a link (not an input) whose text and accessible name is the placeholder; followed in-app', () => {
    const { root, link } = setup();
    expect(root.querySelector('input')).toBeNull();
    expect(link.getAttribute('href')).toBe('/app/customer/new');
    expect(link.textContent?.trim()).toBe('What do you need done?');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    link.click();
    expect(navigate).toHaveBeenCalledWith('/app/customer/new');
  });

  it('styled as a field: white, slate-line, r-m, padding 13 16, min-height 48; 15px slate-400 search icon, gap 10; text body in slate-400', () => {
    const { root } = setup();
    expect(declared('.nm-search-entry', 'background-color')).toEqual(['var(--nitume-white)']);
    expect(declared('.nm-search-entry', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-search-entry', 'border-radius')).toEqual(['var(--nitume-r-m)']);
    expect(declared('.nm-search-entry', 'padding')).toEqual(['13px 16px']);
    expect(declared('.nm-search-entry', 'min-height')).toEqual(['var(--nitume-tap)']);
    expect(declared('.nm-search-entry', 'gap')).toEqual(['10px']);
    expect(declared('.nm-search-entry', 'color')).toEqual(['var(--nitume-slate-400)']);
    const icon = root.querySelector('nm-icon') as HTMLElement;
    expect(icon.getAttribute('data-icon')).toBe('search');
    expect(icon.querySelector('svg')?.getAttribute('width')).toBe('15');
    const text = root.querySelector('.nm-search-entry__text') as HTMLElement;
    expect(getComputedStyle(text).color).toBe('var(--nitume-slate-400)');
    expect(getComputedStyle(text).fontSize).toBe('13.5px');
  });

  it('G7-28. hover border blue, focus ring, tokens only', () => {
    setup();
    expect(cssRuleValues(['.nm-search-entry', ':hover'], 'border-color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-search-entry:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    expect(tokensOnly()).toBe(true);
  });
});
