import { Component, input } from '@angular/core';

@Component({
  selector: 'app-proof-item',
  standalone: true,
  imports: [],
  template: `
    <div class="proof-item">
      <b class="num">{{ value() }}</b>
      <span>{{ label() }}</span>
    </div>
  `,
  styles: [`
    .proof-item {
      font-size: 13px;
      color: var(--slate-600);
    }

    .proof-item b {
      display: block;
      font-family: 'Fira Code', monospace;
      font-size: 22px;
      color: var(--blue);
      font-weight: 600;
      line-height: 1.2;
    }
  `],
})
export class ProofItemComponent {
  readonly value = input.required<string>();
  readonly label = input.required<string>();
}