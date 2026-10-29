// H T2 at component level and the G7-28 minimum for `nm-avatar`.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { declared, tokensOnly } from '../../../../testing/css';
import { NmAvatar, NmAvatarSize } from './avatar.component';

@Component({
  imports: [NmAvatar],
  template: `<nm-avatar [name]="name()" [size]="size()" [href]="href()" label="Profile" />`,
})
class Host {
  readonly name = signal<string | null>('Achieng Wanjiru');
  readonly size = signal<NmAvatarSize>('small');
  readonly href = signal<string | null>('/app/customer/profile');
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
}

describe('nm-avatar (G7-21)', () => {
  it('initials AW in white 700 on a blue circle; as a link: href, name Profile, 48×48 hit area, followed in-app', () => {
    const { root } = setup();
    const link = root.querySelector('a.nm-avatar-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/app/customer/profile');
    expect(link.getAttribute('aria-label')).toBe('Profile');
    expect(root.querySelector('.nm-avatar__initials')?.textContent).toBe('AW');
    expect(declared('.nm-avatar', 'background-color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-avatar__initials', 'color')).toEqual(['var(--nitume-white)']);
    expect(declared('.nm-avatar__initials', 'font-weight')).toEqual(['700']);
    expect(declared('.nm-avatar-link', 'min-width')).toEqual(['var(--nitume-tap)']);
    expect(declared('.nm-avatar-link', 'min-height')).toEqual(['var(--nitume-tap)']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    link.click();
    expect(navigate).toHaveBeenCalledWith('/app/customer/profile');
  });

  it('no name: the white person icon instead of initials', () => {
    const { fixture, host, root } = setup();
    host.name.set('  ');
    fixture.detectChanges();
    expect(root.querySelector('.nm-avatar__initials')).toBeNull();
    expect(root.querySelector('nm-icon')?.getAttribute('data-icon')).toBe('person');
    expect(declared('.nm-avatar', 'color')).toEqual(['var(--nitume-white)']);
  });

  it('sizes: small 36 / 13px, medium 60 / 20px, large 70 / 24px', () => {
    const { fixture, host, root } = setup();
    const circle = () => root.querySelector('.nm-avatar') as HTMLElement;
    expect(circle().classList.contains('nm-avatar--small')).toBe(true);
    expect(declared('.nm-avatar--small', 'width')).toEqual(['36px']);
    expect(declared('.nm-avatar__initials', 'font-size')).toEqual(['13px']);
    host.size.set('medium');
    fixture.detectChanges();
    expect(circle().classList.contains('nm-avatar--medium')).toBe(true);
    expect(declared('.nm-avatar--medium', 'width')).toEqual(['60px']);
    expect(declared('.nm-avatar--medium .nm-avatar__initials', 'font-size')).toEqual(['20px']);
    host.size.set('large');
    fixture.detectChanges();
    expect(circle().classList.contains('nm-avatar--large')).toBe(true);
    expect(declared('.nm-avatar--large', 'width')).toEqual(['70px']);
    expect(declared('.nm-avatar--large .nm-avatar__initials', 'font-size')).toEqual(['24px']);
  });

  it('G7-28. without href: a named image, not focusable; the link has the focus ring; tokens only', () => {
    const { fixture, host, root } = setup();
    expect(declared('.nm-avatar-link:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    host.href.set(null);
    fixture.detectChanges();
    expect(root.querySelector('a')).toBeNull();
    const img = root.querySelector('[role="img"]') as HTMLElement;
    expect(img.getAttribute('aria-label')).toBe('Profile');
    expect(tokensOnly()).toBe(true);
  });
});
