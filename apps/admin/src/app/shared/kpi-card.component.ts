import { Component, input } from '@angular/core';

/**
 * KPI card (design mockup `.kpi-card`): label, Fira-Code value, and an
 * optional delta/sub-line. Delta text uses the palette's green/red as
 * up/down accents only — never as a surface.
 */
@Component({
  selector: 'app-kpi-card',
  imports: [],
  template: `
    <div class="kpi-card">
      <div class="l">{{ label() }}</div>
      <b class="num">{{ value() }}</b>
      @if (delta()) {
        <span class="delta" [class.down]="down()">{{ delta() }}</span>
      }
    </div>
  `,
  styles: [],
})
export class KpiCardComponent {
  readonly label = input<string>('');
  readonly value = input<string>('');
  readonly delta = input<string>('');
  readonly down = input(false);
}
