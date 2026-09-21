import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface UseCase {
  icon: string;
  title: string;
  text: string;
}

@Component({
  selector: 'app-diaspora',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="subhero diaspora-hero">
      <div class="wrap">
        <div class="eyebrow"><span class="rule"></span>Nitume for the diaspora</div>
        <h1>Your trusted person in Kenya.</h1>
        <p>You don't have to ask a cousin or a friend to drop everything. Request a verified local runner for the property check, the family errand, or the document that needs handling properly — from anywhere in the world.</p>
        <a routerLink="/auth" class="btn btn-primary">Request from abroad →</a>
        <div class="quote-block">
          <p>"I needed someone to go to my apartment in Kilimani, check the water leak, speak to the caretaker and send me a report. Nitume had someone there in an hour."</p>
          <span>— Kenyan customer based in London</span>
        </div>
      </div>
    </header>

    <section class="cats">
      <div class="wrap">
        <div class="section-head">
          <h2>What people abroad ask for most</h2>
          <p>Real, recurring requests from diaspora customers.</p>
        </div>
        <div class="use-grid">
          @for (use of useCases; track use.title) {
            <div class="use-card">
              <h4>{{ use.icon }} {{ use.title }}</h4>
              <p>{{ use.text }}</p>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="trust pay-band">
      <div class="wrap">
        <div class="section-head">
          <h2>Pay from anywhere, on your card</h2>
          <p>No need for a Kenyan M-Pesa account — pay by card from wherever you are, and the runner is paid locally.</p>
        </div>
      </div>
    </section>

    <section class="cta">
      <div class="wrap">
        <h2>Someone can be there today — wherever "there" is in Kenya.</h2>
        <a routerLink="/auth" class="btn btn-primary">Request your first task →</a>
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
    .subhero p { font-size: 16px; color: var(--slate-600); max-width: 560px; margin: 0 0 30px; }

    .diaspora-hero { background: var(--slate); }

    .quote-block {
      background: var(--white);
      border-left: 3px solid var(--green);
      border-radius: 0 var(--r-m) var(--r-m) 0;
      padding: 24px 28px;
      margin: 30px 0 0;
      max-width: 560px;
    }
    .quote-block p { font-size: 17px; font-weight: 500; margin: 0 0 8px; color: var(--blue); }
    .quote-block span { font-size: 12.5px; color: var(--slate-600); }

    .cats { padding: 64px 0; }
    .use-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 760px) {
      .use-grid { grid-template-columns: 1fr; }
    }
    .use-card { background: var(--white); border: 1px solid var(--slate-line); border-radius: var(--r-m); padding: 20px; }
    .use-card h4 { margin: 0 0 8px; font-size: 15px; }
    .use-card p { margin: 0; font-size: 13.5px; color: var(--slate-600); }

    .trust { padding: 64px 0; background: var(--slate); }

    .cta { padding: 80px 0; text-align: center; }
    .cta h2 { font-size: 36px; max-width: 640px; margin: 0 auto 26px; font-weight: 700; }
    @media (max-width: 640px) {
      .cta h2 { font-size: 26px; }
    }
    .cta .btn-primary { padding: 15px 30px; font-size: 15.5px; }
  `],
})
export class DiasporaComponent {
  useCases: UseCase[] = [
    { icon: '🏠', title: 'Property checks', text: 'Regular inspection visits with photos and video of your property while you\'re away.' },
    { icon: '🔧', title: 'Contractor supervision', text: 'Confirm renovation or repair work is actually progressing as agreed.' },
    { icon: '📝', title: 'Document & admin handling', text: 'Collect certificates, submit paperwork, or deliver documents to your lawyer.' },
    { icon: '👨‍👩‍👧', title: 'Family errands', text: 'Groceries, medicine pickup, or a visit to check in on a relative — without leaning on family.' },
  ];
}