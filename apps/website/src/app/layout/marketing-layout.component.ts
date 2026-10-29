import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../shared/header/header.component';
import { FooterComponent } from '../shared/footer/footer.component';

/**
 * Marketing frame (auth-foundation §1): the former `AppComponent` template
 * and styles, verbatim. Parents `''`, `business`, `diaspora` and `runner`;
 * `/auth` and `/app/**` render without it.
 */
@Component({
  selector: 'app-marketing-layout',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  template: `
    <app-header />
    <main>
      <router-outlet />
    </main>
    <app-footer />
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--white);
    }
  `],
})
export class MarketingLayoutComponent {}
