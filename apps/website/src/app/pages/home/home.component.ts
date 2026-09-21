import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CategoryCardComponent } from '../../shared/category-card/category-card.component';
import { ProofItemComponent } from '../../shared/proof-item/proof-item.component';
import { ProfileCardComponent, TrustStat } from '../../shared/profile-card/profile-card.component';
import { TicketComponent } from '../../shared/ticket/ticket.component';

interface Cat {
  title: string;
  description: string;
  icon: string;
}

interface HowStep {
  num: string;
  title: string;
  desc: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CategoryCardComponent, ProofItemComponent, ProfileCardComponent, TicketComponent],
  template: `
    <header class="hero">
      <div class="wrap hero-grid">
        <div>
          <div class="eyebrow"><span class="rule"></span>Verified people, real evidence</div>
          <h1 class="hero-h">Someone there, when you can't be.</h1>
          <p class="hero-sub">Nitume sends a verified person to buy, check, collect or represent you anywhere in Nairobi — with proof of every step, and payments that never sit in a stranger's hands.</p>
          <div class="hero-actions">
            <a routerLink="/auth" class="btn btn-primary">Request a task →</a>
            <a href="#how" class="btn btn-outline" (click)="scrollToHow($event)">See how it works</a>
          </div>
          <div class="hero-proof">
            <app-proof-item value="2,400+" label="verified runners" />
            <app-proof-item value="98.6%" label="completion rate" />
            <app-proof-item value="8" label="towns covered" />
          </div>
        </div>
        <app-ticket />
      </div>
    </header>

    <section class="problem">
      <div class="wrap">
        <h2>You don't have a delivery problem. You have a trust problem.</h2>
        <div class="problem-grid">
          @for (item of problems; track item.word) {
            <div class="p-item">
              <p class="p-word">{{ item.word }}</p>
              <p>{{ item.text }}</p>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="cats" id="categories">
      <div class="wrap">
        <div class="section-head">
          <h2>What you can ask for</h2>
          <p>Six defined categories. Every request maps to a clear scope, price and evidence type.</p>
        </div>
        <div class="cat-grid">
          @for (cat of categories; track cat.title) {
            <app-category-card [title]="cat.title" [description]="cat.description" [icon]="cat.icon" />
          }
        </div>
      </div>
    </section>

    <section class="trust" id="trust">
      <div class="wrap trust-grid">
        <div>
          <h2>Every runner carries a trust profile — not just a star rating.</h2>
          <p class="lead">You're not hiring "some guy from WhatsApp." You're hiring a verified, rated, accountable person with a history.</p>
          <ul class="trust-list">
            @for (point of trustPoints; track point) {
              <li><span class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg></span>{{ point }}</li>
            }
          </ul>
        </div>
        <app-profile-card [initials]="'BK'" [name]="'Brian K.'" [sub]="'Verified Runner #10482 · Nairobi'" [stats]="brianStats" [skills]="brianSkills" />
      </div>
    </section>

    <section class="segments" id="segments">
      <div class="wrap">
        <div class="section-head">
          <h2>Built for two kinds of trust</h2>
          <p>The same verified network, two very different reasons to rely on it.</p>
        </div>
        <div class="seg-grid">
          <div class="seg-card diaspora" (click)="go('/diaspora')" role="link" tabindex="0" (keydown.enter)="go('/diaspora')">
            <h3>For Kenyans abroad</h3>
            <p>Your trusted person in Kenya — for the property check, the family errand, the document your relative shouldn't have to handle alone.</p>
            <a>Request from anywhere →</a>
          </div>
          <div class="seg-card business" (click)="go('/business')" role="link" tabindex="0" (keydown.enter)="go('/business')">
            <h3>For businesses</h3>
            <p>Your field team, without hiring one. Dispatch verified people to inspect, verify and collect across every branch.</p>
            <a>See business plans →</a>
          </div>
        </div>
      </div>
    </section>

    <section class="how" id="how">
      <div class="wrap">
        <div class="section-head">
          <h2>How a task moves</h2>
          <p>Every request follows the same accountable path, from ask to evidence.</p>
        </div>
        <div class="how-list">
          @for (step of steps; track step.num) {
            <div class="how-row">
              <div class="how-num num">{{ step.num }}</div>
              <div class="how-title">{{ step.title }}</div>
              <div class="how-desc">{{ step.desc }}</div>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="cta">
      <div class="wrap">
        <h2>Whatever it is — someone can be there in an hour.</h2>
        <a routerLink="/auth" class="btn btn-primary">Request your first task →</a>
      </div>
    </section>
  `,
  styles: [`
    /* Hero */
    .hero { padding: 88px 0 56px; background: var(--white); }
    .hero-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 60px; align-items: center; }
    @media (max-width: 900px) {
      .hero-grid { grid-template-columns: 1fr; }
    }
    .eyebrow { display: inline-flex; align-items: center; gap: 8px; color: var(--green-700); font-weight: 600; font-size: 13px; margin-bottom: 18px; }
    .eyebrow .rule { width: 26px; height: 1.5px; background: var(--green-700); display: inline-block; }
    h1.hero-h { font-size: 50px; line-height: 1.08; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 20px; color: var(--blue); }
    @media (max-width: 640px) {
      h1.hero-h { font-size: 36px; }
    }
    .hero-sub { font-size: 17px; color: var(--slate-600); max-width: 460px; margin: 0 0 32px; }
    .hero-actions { display: flex; gap: 14px; margin-bottom: 36px; flex-wrap: wrap; }
    .hero-proof { display: flex; gap: 28px; flex-wrap: wrap; }

    /* Problem */
    .problem { padding: 64px 0; background: var(--slate); }
    .problem-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 36px; margin-top: 38px; }
    @media (max-width: 860px) {
      .problem-grid { grid-template-columns: 1fr; }
    }
    .problem h2 { font-size: 30px; font-weight: 700; max-width: 640px; margin: 0; }
    @media (max-width: 640px) {
      .problem h2 { font-size: 24px; }
    }
    .p-item { background: var(--white); border: 1px solid var(--slate-line); border-radius: var(--r-m); padding: 22px; }
    .p-item .p-word { font-size: 17px; font-weight: 700; color: var(--blue); margin: 0 0 8px; }
    .p-item p { color: var(--slate-600); font-size: 14.5px; margin: 0; }

    /* Cats */
    .cats { padding: 64px 0; }
    .cat-grid { display: grid; gap: 16px; }
    @media (min-width: 561px) and (max-width: 860px) {
      .cat-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 861px) {
      .cat-grid { grid-template-columns: repeat(3, 1fr); }
    }

    /* Trust */
    .trust { padding: 64px 0; background: var(--slate); }
    .trust-grid { display: grid; grid-template-columns: 0.95fr 1.05fr; gap: 60px; align-items: center; }
    @media (max-width: 900px) {
      .trust-grid { grid-template-columns: 1fr; }
    }
    .trust h2 { font-size: 30px; font-weight: 700; margin: 0 0 16px; }
    @media (max-width: 640px) {
      .trust h2 { font-size: 24px; }
    }
    .trust p.lead { color: var(--slate-600); font-size: 15.5px; max-width: 440px; margin: 0 0 24px; }
    .trust-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    .trust-list li { display: flex; gap: 12px; align-items: flex-start; font-size: 14px; color: var(--slate-600); }

    /* Segments */
    .segments { padding: 64px 0; }
    .seg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 800px) {
      .seg-grid { grid-template-columns: 1fr; }
    }
    .seg-card { border-radius: var(--r-l); padding: 36px; cursor: pointer; }
    .seg-card.diaspora { background: var(--blue); color: #DCE3EE; }
    .seg-card.business { background: var(--white); border: 1px solid var(--slate-line); color: var(--blue); }
    .seg-card h3 { font-size: 24px; font-weight: 700; margin: 0 0 12px; color: inherit; }
    .seg-card p { font-size: 14px; max-width: 340px; margin: 0 0 24px; }
    .seg-card.diaspora p { color: #AEB9CC; }
    .seg-card.business p { color: var(--slate-600); }
    .seg-card a { font-size: 14px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .seg-card.diaspora a { color: var(--white); }
    .seg-card.business a { color: var(--green-700); }

    /* How */
    .how { padding: 64px 0; background: var(--slate); }
    .how-list { margin-top: 38px; }
    .how-row { display: grid; grid-template-columns: 60px 1fr 1fr; gap: 22px; padding: 22px 24px; background: var(--white); border: 1px solid var(--slate-line); border-radius: var(--r-m); align-items: baseline; margin-bottom: 10px; }
    @media (max-width: 760px) {
      .how-row { grid-template-columns: 36px 1fr; }
      .how-row .how-desc { grid-column: 2; }
    }
    .how-num { font-family: 'Fira Code', monospace; font-size: 18px; color: var(--slate-400); font-weight: 600; }
    .how-title { font-size: 16px; font-weight: 600; }
    .how-desc { color: var(--slate-600); font-size: 14px; }

    /* CTA */
    .cta { padding: 80px 0; text-align: center; }
    .cta h2 { font-size: 36px; max-width: 640px; margin: 0 auto 26px; font-weight: 700; }
    @media (max-width: 640px) {
      .cta h2 { font-size: 26px; }
    }
    .cta .btn-primary { padding: 15px 30px; font-size: 15.5px; }
  `],
})
export class HomeComponent {
  problems = [
    { word: 'Time', text: 'You have things that need doing, but not the hours left in the day to do them.' },
    { word: 'Distance', text: "You're across town, in another city, or another country — and the task is here." },
    { word: 'Trust', text: "You don't know who to hand KSh 30,000, or your front-door keys, to." },
  ];

  categories: Cat[] = [
    { title: 'Buy For Me', description: 'Groceries, electronics, gifts, spares — bought against your budget, receipt attached.', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#04AF4D" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' },
    { title: 'Get It For Me', description: 'Pickup and delivery between two points — parcels, documents, dry-cleaning, cakes.', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#04AF4D" stroke-width="2"><rect x="3" y="8" width="14" height="10" rx="2"/><path d="M17 12h3l2 3v3h-5"/><circle cx="7.5" cy="20.5" r="1.5"/><circle cx="17.5" cy="20.5" r="1.5"/></svg>' },
    { title: 'Check It For Me', description: 'Photos, video and a written report on an apartment, car, shop or supplier.', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#04AF4D" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>' },
    { title: 'Go There For Me', description: 'Attend a viewing, meet a supplier, represent you where you physically can\'t be.', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#04AF4D" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>' },
    { title: 'Wait For Me', description: 'Queues and admin errands — document collection, office submissions.', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#04AF4D" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' },
    { title: 'Business Tasks', description: 'Branding checks, stock verification and site visits across many locations.', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#04AF4D" stroke-width="2"><rect x="3" y="7" width="7" height="7" rx="1"/><rect x="14" y="7" width="7" height="7" rx="1"/><rect x="3" y="16" width="7" height="4" rx="1"/><rect x="14" y="16" width="7" height="4" rx="1"/></svg>' },
  ];

  trustPoints = [
    'National ID, phone, face and M-Pesa identity all verified before a runner can take a paid task.',
    'Completion rate, on-time rate and cancellation rate — visible, not hidden behind a single average.',
    'Every task logs a timestamped timeline — arrival, photos, payment, delivery — for both sides.',
  ];

  brianStats: TrustStat[] = [
    { value: '137', label: 'errands done' },
    { value: '4.9', label: 'rating' },
    { value: '98.7%', label: 'completion' },
  ];

  brianSkills = ['Shopping', 'Documents', 'Inspections', 'Property visits', 'CBD · Westlands · Kilimani'];

  steps: HowStep[] = [
    { num: '01', title: 'Describe the task', desc: 'Category, location, deadline and budget — priced instantly.' },
    { num: '02', title: 'A verified runner is matched', desc: 'Ranked by distance, trust score and skill — you see who\'s coming.' },
    { num: '03', title: 'Track it live', desc: 'Watch the runner en route, get notified on arrival, approve any price change.' },
    { num: '04', title: 'Confirm with evidence', desc: 'Photos, receipts and a timestamped timeline before you release payment.' },
  ];

  constructor(private readonly router: Router) {}

  go(path: string) {
    this.router.navigate([path]);
  }

  scrollToHow(event: Event) {
    event.preventDefault();
    document.getElementById('how')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}