import { Component, input } from '@angular/core';

@Component({
  selector: 'app-ticket',
  standalone: true,
  template: `
    <div class="ticket">
      <div class="ticket-head">
        <span class="tag-chip">{{ category() }}</span>
        <span class="task-id num">{{ taskId() }}</span>
      </div>
      <h3>{{ title() }}</h3>
      <p class="desc">{{ description() }}</p>
      <div class="route">
        <div class="pt"><span class="lbl">Runner starts</span>{{ from() }}</div>
        <div class="pt dest"><span class="lbl">Task site</span>{{ to() }}</div>
      </div>
      <div class="ticket-foot">
        <div class="runner-chip">
          <div class="avatar">{{ initials() }}</div>
          <div>
            <div class="runner-name">{{ runnerName() }}</div>
            <div class="runner-sub num">{{ runnerMeta() }}</div>
          </div>
        </div>
        <span class="status-pill"><span class="pulse"></span>{{ status() }}</span>
      </div>
    </div>
  `,
  styles: [`
    .ticket {
      background: var(--white);
      border-radius: var(--r-l);
      border: 1px solid var(--slate-line);
      padding: 26px;
      box-shadow: 0 24px 50px -30px rgba(11, 37, 69, 0.25);
    }
    .ticket-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .tag-chip {
      font-size: 12px;
      font-weight: 600;
      color: var(--blue);
      background: var(--blue-050);
      padding: 5px 10px;
      border-radius: 999px;
    }
    .task-id {
      font-family: 'Fira Code', monospace;
      font-size: 12px;
      color: var(--slate-400);
    }
    h3 {
      margin: 0 0 6px;
      font-size: 19px;
      font-weight: 600;
    }
    p.desc {
      margin: 0 0 18px;
      color: var(--slate-600);
      font-size: 14px;
    }
    .route {
      position: relative;
      padding-left: 20px;
      margin-bottom: 18px;
    }
    .route .pt {
      position: relative;
      padding: 0 0 20px 0;
      font-size: 13.5px;
    }
    .route .pt:last-child { padding-bottom: 0; }
    .route .pt::before {
      content: '';
      position: absolute;
      left: -20px;
      top: 3px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--blue);
    }
    .route .pt.dest::before { background: var(--green); }
    .route::after {
      content: '';
      position: absolute;
      left: -16px;
      top: 8px;
      bottom: 16px;
      width: 1px;
      background: var(--slate-line);
    }
    .route .pt .lbl {
      color: var(--slate-400);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      display: block;
      margin-bottom: 2px;
    }
    .ticket-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid var(--slate-line);
      padding-top: 16px;
    }
    .runner-chip {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--blue);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
    }
    .runner-name { font-size: 13.5px; font-weight: 600; }
    .runner-sub {
      font-family: 'Fira Code', monospace;
      font-size: 11px;
      color: var(--slate-400);
    }
    .status-pill {
      font-size: 12px;
      font-weight: 600;
      color: var(--amber);
      background: var(--amber-050);
      padding: 6px 12px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status-pill .pulse {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--amber);
      animation: pulse 1.6s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(184,134,11,0.4); }
      70% { box-shadow: 0 0 0 8px rgba(184,134,11,0); }
      100% { box-shadow: 0 0 0 0 rgba(184,134,11,0); }
    }
  `],
})
export class TicketComponent {
  readonly category = input('Inspection');
  readonly taskId = input('#NT-10482');
  readonly title = input('Check the apartment in Nyali');
  readonly description = input('Video the compound, both bedrooms and the bathroom. Speak to the caretaker about the water leak.');
  readonly from = input('Nyali Beach Road, Mombasa');
  readonly to = input('Links Road Apartments, Nyali');
  readonly initials = input('BK');
  readonly runnerName = input('Brian K.');
  readonly runnerMeta = input('Verified · 4.9 · 137 tasks');
  readonly status = input('En route');
}