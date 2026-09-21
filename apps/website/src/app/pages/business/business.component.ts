import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryCardComponent } from '../../shared/category-card/category-card.component';

interface Cat {
  title: string;
  description: string;
  icon: string;
}

interface Plan {
  tag: string;
  name: string;
  price: string;
  priceSub?: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

@Component({
  selector: 'app-business',
  standalone: true,
  imports: [RouterLink, CategoryCardComponent],
  template: `
    <header class="subhero biz-band">
      <div class="wrap">
        <div class="eyebrow biz-eyebrow"><span class="rule biz-rule"></span>Nitume for Business</div>
        <h1 class="biz-h">Your field team, without hiring one.</h1>
        <p class="biz-p">Dispatch verified people to inspect shops, verify stock, collect documents and visit customers across every branch — priced per task or on a monthly plan.</p>
        <a routerLink="/auth" class="btn btn-primary">Talk to sales →</a>
        <div class="biz-stats">
          <div class="biz-stat"><b class="num">20+</b><span>branches covered for a single retail account</span></div>
          <div class="biz-stat"><b class="num">98.6%</b><span>task completion rate across business accounts</span></div>
          <div class="biz-stat"><b class="num">&lt; 2 min</b><span>average time to submit a task via API</span></div>
        </div>
      </div>
    </header>

    <section class="cats">
      <div class="wrap">
        <div class="section-head">
          <h2>Built for outsourced field operations</h2>
          <p>Everything a distributed team needs, without adding headcount.</p>
        </div>
        <div class="cat-grid">
          @for (cat of categories; track cat.title) {
            <app-category-card [title]="cat.title" [description]="cat.description" [icon]="cat.icon" />
          }
        </div>
      </div>
    </section>

    <section class="cats plans">
      <div class="wrap">
        <div class="section-head">
          <h2>Plans</h2>
          <p>Pay per task, or move to a monthly plan as volume grows.</p>
        </div>
        <div class="plan-grid">
          @for (plan of plans; track plan.name) {
            <div class="plan-card" [class.featured]="plan.featured">
              <span class="ptag">{{ plan.tag }}</span>
              <h4>{{ plan.name }}</h4>
              <div class="price num">{{ plan.price }}<span>{{ plan.priceSub }}</span></div>
              <ul class="plan-list">
                @for (feature of plan.features; track feature) {
                  <li><span class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg></span>{{ feature }}</li>
                }
              </ul>
              <a routerLink="/auth" class="btn" [class.btn-primary]="plan.featured" [class.btn-outline]="!plan.featured" [style.width]="'100%'">{{ plan.cta }}</a>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="cta">
      <div class="wrap">
        <h2>Turn Nitume's runner network into your field team.</h2>
        <a routerLink="/auth" class="btn btn-primary">Talk to sales →</a>
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

    .biz-band { background: var(--blue); color: #fff; }
    .biz-eyebrow { color: #5FE092; }
    .biz-rule { background: #5FE092; }
    .biz-h { color: var(--white); }
    .biz-p { color: #AEB9CC; }
    .biz-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 32px; }
    @media (max-width: 760px) {
      .biz-stats { grid-template-columns: 1fr; }
    }
    .biz-stat { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 20px; }
    .biz-stat b { display: block; font-family: 'Fira Code', monospace; font-size: 26px; margin-bottom: 4px; }
    .biz-stat span { font-size: 12.5px; color: #AEB9CC; }

    .cats { padding: 64px 0; }
    .cat-grid { display: grid; gap: 16px; }
    @media (min-width: 561px) and (max-width: 860px) {
      .cat-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 861px) {
      .cat-grid { grid-template-columns: repeat(3, 1fr); }
    }

    .plans { background: var(--slate); }
    .plan-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
    @media (max-width: 900px) {
      .plan-grid { grid-template-columns: 1fr; }
    }
    .plan-card { background: var(--white); border: 1px solid var(--slate-line); border-radius: var(--r-m); padding: 26px; }
    .plan-card.featured { border-color: var(--green); box-shadow: 0 0 0 1px var(--green); }
    .plan-card .ptag { font-size: 11px; font-weight: 700; color: var(--green-700); background: var(--green-050); padding: 4px 10px; border-radius: 999px; display: inline-block; margin-bottom: 14px; }
    .plan-card h4 { font-size: 19px; margin: 0 0 4px; }
    .plan-card .price { font-family: 'Fira Code', monospace; font-size: 26px; font-weight: 600; margin-bottom: 16px; }
    .plan-card .price span { font-size: 12px; color: var(--slate-600); font-weight: 400; font-family: 'Fira Sans', sans-serif; }
    .plan-card .price.gray { font-size: 13px; color: var(--slate-600); font-weight: 400; }
    .plan-list { list-style: none; margin: 0 0 20px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .plan-list li { font-size: 13.5px; color: var(--slate-600); display: flex; gap: 9px; align-items: flex-start; }

    .cta { padding: 80px 0; text-align: center; }
    .cta h2 { font-size: 36px; max-width: 640px; margin: 0 auto 26px; font-weight: 700; }
    @media (max-width: 640px) {
      .cta h2 { font-size: 26px; }
    }
    .cta .btn-primary { padding: 15px 30px; font-size: 15.5px; }
  `],
})
export class BusinessComponent {
  categories: Cat[] = [
    { title: 'Branding & compliance checks', description: 'Photograph signage, shelf placement and displays across every location.', icon: '🏬' },
    { title: 'Stock verification', description: "Confirm what's actually on shelves versus what your system reports.", icon: '📦' },
    { title: 'Document & signature runs', description: 'Collect signed contracts, delivery notes and paperwork between offices.', icon: '📝' },
    { title: 'Property & site inspections', description: 'Photo and video reports on any property in the Nitume network.', icon: '🏠' },
    { title: 'Customer visits', description: 'Send a verified representative to meet a customer on your behalf.', icon: '🤝' },
    { title: 'API access', description: 'Submit and track tasks programmatically — POST /tasks from your own systems.', icon: '🔌' },
  ];

  plans: Plan[] = [
    {
      tag: 'STARTER',
      name: 'Pay per task',
      price: 'Task pricing',
      priceSub: ' · no minimum',
      features: ['Standard task pricing', 'Admin dashboard access', 'Email support'],
      cta: 'Get started',
    },
    {
      tag: 'BUSINESS PRO',
      name: 'KSh 15,000/mo',
      price: 'Discounted task fees',
      featured: true,
      features: [
        'Everything in Starter',
        'Priority runner matching',
        'Weekly reporting',
        'Dedicated support',
      ],
      cta: 'Get started',
    },
    {
      tag: 'ENTERPRISE',
      name: 'Custom',
      price: 'Volume-based pricing',
      features: ['Full API access', 'Multi-city coverage', 'SLA-backed support'],
      cta: 'Talk to sales',
    },
  ];
}