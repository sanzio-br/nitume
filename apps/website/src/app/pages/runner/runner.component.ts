import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProfileCardComponent, TrustStat } from '../../shared/profile-card/profile-card.component';

interface StepCard {
  n: string;
  title: string;
  desc: string;
}

@Component({
  selector: 'app-runner',
  standalone: true,
  imports: [RouterLink, ProfileCardComponent],
  template: `
    <header class="subhero earn-band">
      <div class="wrap">
        <div class="eyebrow"><span class="rule"></span>Earn with Nitume</div>
        <h1>Turn spare hours into steady income.</h1>
        <p>Accept tasks near you, get paid per job, and build a verified track record that unlocks higher-paying work. No shifts, no boss — just jobs you choose to take.</p>
        <a routerLink="/auth" class="btn btn-primary">Apply to become a Runner →</a>
      </div>
    </header>

    <section class="cats">
      <div class="wrap">
        <div class="section-head">
          <h2>How it works</h2>
          <p></p>
        </div>
        <div class="step-num-row">
          @for (step of steps; track step.n) {
            <div class="step-num-card">
              <div class="n num">{{ step.n }}</div>
              <h4>{{ step.title }}</h4>
              <p>{{ step.desc }}</p>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="trust">
      <div class="wrap trust-grid">
        <div>
          <h2>What you need to apply</h2>
          <ul class="req-list">
            @for (req of requirements; track req) {
              <li><span class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg></span>{{ req }}</li>
            }
          </ul>
        </div>
        <app-profile-card [initials]="'FM'" [name]="'Faith M.'" [sub]="'Runner since March 2026'" [stats]="faithStats" [skills]="faithQuote" />
      </div>
    </section>

    <section class="cta">
      <div class="wrap">
        <h2>Apply in under ten minutes.</h2>
        <a routerLink="/auth" class="btn btn-primary">Apply to become a Runner →</a>
      </div>
    </section>
  `,
  styles: [`
    .subhero { padding: 64px 0 48px; }
    .subhero .eyebrow { margin-bottom: 16px; }
    .subhero h1 { font-size: 42px; font-weight: 700; margin: 0 0 18px; max-width: 640px; letter-spacing: -0.01em; }
    @media (max-width: 640px) {
      .subhero h1 { font-size: 30px; }
    }
    .subhero p { font-size: 16px; color: var(--slate-600); max-width: 520px; margin: 0 0 30px; }

    .earn-band { background: var(--green-050); }

    .cats { padding: 64px 0; }
    .step-num-row { display: flex; gap: 16px; }
    @media (max-width: 760px) {
      .step-num-row { flex-direction: column; }
    }
    .step-num-card {
      flex: 1;
      background: var(--white);
      border: 1px solid var(--slate-line);
      border-radius: var(--r-m);
      padding: 22px;
      text-align: center;
    }
    .step-num-card .n {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--blue);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Fira Code', monospace;
      font-weight: 600;
      margin: 0 auto 14px;
    }
    .step-num-card h4 { font-size: 14.5px; margin: 0 0 6px; }
    .step-num-card p { font-size: 13px; color: var(--slate-600); margin: 0; }

    .trust { padding: 64px 0; background: var(--slate); }
    .trust-grid { display: grid; grid-template-columns: 0.95fr 1.05fr; gap: 60px; align-items: center; }
    @media (max-width: 900px) {
      .trust-grid { grid-template-columns: 1fr; }
    }
    .trust h2 { font-size: 30px; font-weight: 700; margin: 0 0 24px; }
    @media (max-width: 640px) {
      .trust h2 { font-size: 24px; }
    }
    .req-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .req-list li { display: flex; gap: 12px; font-size: 14.5px; color: var(--slate-600); align-items: flex-start; }

    .cta { padding: 80px 0; text-align: center; }
    .cta h2 { font-size: 36px; max-width: 640px; margin: 0 auto 26px; font-weight: 700; }
    @media (max-width: 640px) {
      .cta h2 { font-size: 26px; }
    }
    .cta .btn-primary { padding: 15px 30px; font-size: 15.5px; }
  `],
})
export class RunnerComponent {
  steps: StepCard[] = [
    { n: '1', title: 'Apply & verify', desc: 'ID, phone, selfie and M-Pesa identity check — usually under 24 hours.' },
    { n: '2', title: 'Set your areas', desc: 'Choose the neighborhoods and task types you want to work.' },
    { n: '3', title: 'Accept jobs', desc: 'Go online, accept offers near you, and get turn-by-turn navigation.' },
    { n: '4', title: 'Get paid', desc: 'Earnings land in your Nitume balance — request an M-Pesa payout anytime.' },
  ];

  requirements = [
    'A valid Kenyan National ID',
    'A smartphone with GPS and mobile data',
    'An active M-Pesa line in your own name',
    'A way of getting around your chosen service area',
  ];

  faithStats: TrustStat[] = [
    { value: 'KSh 34K', label: 'last 30 days' },
    { value: '89', label: 'errands' },
    { value: '4.8', label: 'rating' },
  ];

  faithQuote = ['"Flexible enough to fit around my other work — I choose what I take."'];
}