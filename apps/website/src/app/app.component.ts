import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Bare root: the marketing pages get their header and footer from
 *  MarketingLayoutComponent; `/auth` and `/app/**` have their own frames. */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AppComponent {}
