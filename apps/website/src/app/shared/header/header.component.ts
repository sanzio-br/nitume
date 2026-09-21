import { Component, HostListener } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav [class.scrolled]="scrolled">
      <div class="wrap">
        <a routerLink="/" class="brand" aria-label="Nitume Home">
          <span class="dot"></span>Nitume
        </a>

        <ul class="navlinks" role="navigation" aria-label="Main navigation">
          <li><a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{exact: true}">Home</a></li>
          <li><a routerLink="/business" routerLinkActive="on">For Business</a></li>
          <li><a routerLink="/diaspora" routerLinkActive="on">For Diaspora</a></li>
          <li><a routerLink="/runner" routerLinkActive="on">Become a Runner</a></li>
        </ul>

        <div class="nav-actions">
          <a routerLink="/auth" class="btn btn-outline">Log in</a>
          <a routerLink="/auth" class="btn btn-primary">Request a task</a>
        </div>

        <button class="mobile-menu-btn" (click)="mobileOpen = !mobileOpen" aria-expanded="{{mobileOpen}}" aria-label="Toggle menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            @if (!mobileOpen) {
              <path d="M4 6h16M4 12h16M4 18h16"/>
            } @else {
              <path d="M6 18L18 6M6 6l12 12"/>
            }
          </svg>
        </button>
      </div>

      @if (mobileOpen) {
        <div class="mobile-menu" role="dialog" aria-label="Mobile menu">
          <ul class="mobile-navlinks">
            <li><a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{exact: true}" (click)="mobileOpen = false">Home</a></li>
            <li><a routerLink="/business" routerLinkActive="on" (click)="mobileOpen = false">For Business</a></li>
            <li><a routerLink="/diaspora" routerLinkActive="on" (click)="mobileOpen = false">For Diaspora</a></li>
            <li><a routerLink="/runner" routerLinkActive="on" (click)="mobileOpen = false">Become a Runner</a></li>
            <li class="mobile-actions">
              <a routerLink="/auth" class="btn btn-outline" (click)="mobileOpen = false">Log in</a>
              <a routerLink="/auth" class="btn btn-primary" (click)="mobileOpen = false">Request a task</a>
            </li>
          </ul>
        </div>
      }
    </nav>
  `,
  styles: [`
    nav {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(6px);
      border-bottom: 1px solid var(--slate-line);
      transition: box-shadow 0.15s, background 0.15s;
    }

    nav.scrolled {
      box-shadow: 0 4px 20px -10px rgba(11, 37, 69, 0.15);
    }

    nav .wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 76px;
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
      flex-shrink: 0;
    }

    .navlinks {
      display: flex;
      gap: 30px;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .navlinks a {
      color: var(--slate-600);
      text-decoration: none;
      font-size: 14.5px;
      font-weight: 500;
      font-family: 'Fira Sans', sans-serif;
      padding: 0;
      transition: color 0.15s;
    }

    .navlinks a:hover,
    .navlinks a.on {
      color: var(--blue);
      text-decoration: none;
    }

    .nav-actions {
      display: flex;
      gap: 12px;
    }

    .mobile-menu-btn {
      display: none;
      background: none;
      border: none;
      cursor: pointer;
      padding: 8px;
      color: var(--blue);
    }

    .mobile-menu {
      display: none;
      position: absolute;
      top: 76px;
      left: 0;
      right: 0;
      background: var(--white);
      border-bottom: 1px solid var(--slate-line);
      padding: 20px;
      box-shadow: 0 10px 30px -10px rgba(11, 37, 69, 0.15);
      z-index: 49;
    }

    .mobile-navlinks {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .mobile-navlinks a {
      color: var(--slate-600);
      text-decoration: none;
      font-size: 16px;
      font-weight: 500;
      font-family: 'Fira Sans', sans-serif;
      padding: 8px 0;
      transition: color 0.15s;
    }

    .mobile-navlinks a:hover,
    .mobile-navlinks a.on {
      color: var(--blue);
      text-decoration: none;
    }

    .mobile-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 8px;
    }

    @media (max-width: 900px) {
      .navlinks,
      .nav-actions {
        display: none;
      }

      .mobile-menu-btn {
        display: block;
      }

      .mobile-menu.open {
        display: block;
      }
    }
  `],
})
export class HeaderComponent {
  scrolled = false;
  mobileOpen = false;

  constructor(private router: Router) {}

  @HostListener('window:scroll')
  onScroll() {
    this.scrolled = window.scrollY > 8;
  }
}