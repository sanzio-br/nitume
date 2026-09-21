import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer>
      <div class="wrap">
        <a routerLink="/" class="brand" aria-label="Nitume Home">
          <span class="dot"></span>Nitume
        </a>

        <nav class="flinks" aria-label="Footer navigation">
          <a routerLink="/business" routerLinkActive="on">For Business</a>
          <a routerLink="/diaspora" routerLinkActive="on">For Diaspora</a>
          <a routerLink="/runner" routerLinkActive="on">Become a Runner</a>
        </nav>

        <div class="fcols">
          Nairobi · Mombasa · Kisumu · Nakuru · Eldoret · Thika — © {{ year }} Nitume
        </div>
      </div>
    </footer>
  `,
  styles: [`
    footer {
      border-top: 1px solid var(--slate-line);
      padding: 34px 0;
      margin-top: auto;
    }

    footer .wrap {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 14px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 21px;
      color: var(--blue);
      text-decoration: none;
      border: none;
      background: none;
      font-family: 'Fira Sans', sans-serif;
      cursor: pointer;
      padding: 0;
    }

    .brand .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--green);
    }

    .flinks {
      display: flex;
      gap: 20px;
    }

    .flinks a {
      background: none;
      border: none;
      color: var(--slate-600);
      font-size: 13px;
      cursor: pointer;
      font-family: 'Fira Sans', sans-serif;
      padding: 0;
      text-decoration: none;
      transition: color 0.15s;
    }

    .flinks a:hover,
    .flinks a.on {
      color: var(--blue);
    }

    .fcols {
      color: var(--slate-400);
      font-size: 13px;
      white-space: nowrap;
    }

    @media (max-width: 640px) {
      footer .wrap {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
      }

      .flinks {
        flex-wrap: wrap;
      }

      .fcols {
        white-space: normal;
      }
    }
  `],
})
export class FooterComponent {
  year = new Date().getFullYear();
}