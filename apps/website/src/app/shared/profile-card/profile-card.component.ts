import { Component, input } from '@angular/core';

export interface TrustStat {
  value: string;
  label: string;
}

@Component({
  selector: 'app-profile-card',
  standalone: true,
  template: `
    <div class="profile-card">
      <div class="profile-top">
        <div class="profile-avatar">{{ initials() }}</div>
        <div>
          <p class="profile-name">{{ name() }}</p>
          <p class="profile-sub num">● {{ sub() }}</p>
        </div>
      </div>
      <div class="stat-row">
        @for (stat of stats(); track stat.label) {
          <div class="stat"><b class="num">{{ stat.value }}</b><span>{{ stat.label }}</span></div>
        }
      </div>
      <div class="skill-row">
        @for (skill of skills(); track skill) {
          <span class="skill">{{ skill }}</span>
        }
      </div>
    </div>
  `,
  styles: [`
    .profile-card {
      background: var(--blue);
      color: var(--white);
      border-radius: var(--r-l);
      padding: 30px;
    }
    .profile-top {
      display: flex;
      gap: 14px;
      align-items: center;
      margin-bottom: 20px;
    }
    .profile-avatar {
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: var(--green);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
      color: var(--white);
      flex: 0 0 auto;
    }
    .profile-name { font-size: 19px; font-weight: 700; margin: 0; }
    .profile-sub {
      font-family: 'Fira Code', monospace;
      font-size: 12.5px;
      color: #AEB9CC;
      margin-top: 2px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .stat-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .stat {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      padding: 13px 12px;
    }
    .stat b {
      display: block;
      font-family: 'Fira Code', monospace;
      font-size: 19px;
      font-weight: 600;
    }
    .stat span { font-size: 10.5px; color: #AEB9CC; }
    .skill-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .skill {
      font-size: 12px;
      background: rgba(255,255,255,0.09);
      border: 1px solid rgba(255,255,255,0.12);
      padding: 6px 11px;
      border-radius: 999px;
      color: #E7ECF4;
    }
  `],
})
export class ProfileCardComponent {
  readonly initials = input.required<string>();
  readonly name = input.required<string>();
  readonly sub = input.required<string>();
  readonly stats = input<TrustStat[]>([]);
  readonly skills = input<string[]>([]);
}