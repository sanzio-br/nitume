import { Component, input } from '@angular/core';

@Component({
  selector: 'app-category-card',
  standalone: true,
  imports: [],
  template: `
    <div class="cat-card">
      <div class="icn" [innerHTML]="icon()"></div>
      <h4>{{ title() }}</h4>
      <p>{{ description() }}</p>
    </div>
  `,
  styles: [`
    .cat-card {
      background: var(--white);
      border: 1px solid var(--slate-line);
      border-radius: var(--r-m);
      padding: 22px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .cat-card:hover {
      border-color: var(--green);
      box-shadow: 0 8px 24px -8px rgba(4, 175, 77, 0.15);
    }

    .icn {
      width: 36px;
      height: 36px;
      border-radius: 9px;
      background: var(--green-050);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 14px;
    }

    .icn svg {
      width: 17px;
      height: 17px;
    }

    h4 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 600;
      color: var(--blue);
    }

    p {
      margin: 0;
      font-size: 13px;
      color: var(--slate-600);
      line-height: 1.5;
    }
  `],
})
export class CategoryCardComponent {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly icon = input.required<string>(); // SVG string
}