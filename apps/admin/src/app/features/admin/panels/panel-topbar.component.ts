import { Component, input, output } from '@angular/core';

/**
 * Panel topbar (design mockup `.topbar`): h1 + Fira-Code sub-line, optional
 * search box, and an `[topbar-actions]` projection slot for panel-specific
 * buttons. Shared so every ops panel keeps the same chrome.
 */
@Component({
  selector: 'app-panel-topbar',
  imports: [],
  template: `
    <div class="ops-topbar">
      <div>
        <h1>{{ title() }}</h1>
        <div class="sub">{{ sub() }}</div>
      </div>
      <div class="ops-top-actions">
        @if (searchPlaceholder()) {
          <label class="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-3.5-3.5"></path>
            </svg>
            <input
              type="search"
              [placeholder]="searchPlaceholder()"
              [value]="search()"
              (input)="onInput($event)"
              aria-label="Search"
            />
          </label>
        }
        <ng-content select="[topbar-actions]" />
      </div>
    </div>
  `,
  styles: [],
})
export class PanelTopbarComponent {
  readonly title = input<string>('');
  readonly sub = input<string>('');
  readonly searchPlaceholder = input<string>('');
  readonly search = input<string>('');

  readonly searchChange = output<string>();

  protected onInput(event: Event): void {
    this.searchChange.emit((event.target as HTMLInputElement).value);
  }
}
