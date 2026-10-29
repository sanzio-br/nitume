// Component styles that use the token mixins come from .scss files
// (auth-foundation §7.1 "Style files"; §9.11 F9.61, F9.62).
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { declared } from '../../testing/css';
import { SignInMessageComponent } from './sign-in/sign-in-message.component';
import { AppSplashComponent } from './splash.component';

@Component({
  imports: [AppSplashComponent, SignInMessageComponent],
  template: `
    <app-splash />
    <app-sign-in-message [message]="{ kind: 'text', text: 'Something went wrong. Please try again.' }" />
  `,
})
class Host {}

function render(): HTMLElement {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('#6 component styles from .scss', () => {
  it('F9.61. the splash Loading status is visually hidden (nm-visually-hidden from splash.component.scss)', () => {
    const root = render();
    const status = root.querySelector('app-splash [role="status"]') as HTMLElement;
    expect(status.textContent).toBe('Loading');
    expect(declared('.status', 'clip-path')).toEqual(['inset(50%)']);
    expect(declared('.status', 'width')).toEqual(['1px']);
    expect(getComputedStyle(status).position).toBe('absolute');
  });

  it('F9.62. the sign-in other-error line uses the error type style', () => {
    const root = render();
    const line = root.querySelector('app-sign-in-message .message') as HTMLElement;
    expect(declared('.message', 'color')).toEqual(['var(--nitume-red)']);
    expect(declared('.message', 'font-size')).toEqual(['12.5px']);
    expect(getComputedStyle(line).color).toBe('var(--nitume-red)');
    expect(getComputedStyle(line).fontSize).toBe('12.5px');
    expect(getComputedStyle(line).fontWeight).toBe('400');
  });
});
