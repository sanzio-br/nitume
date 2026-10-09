import { Component, input, output } from '@angular/core';

/** "Load more" pagination (A-12): centred outline button. */
@Component({
  selector: 'app-load-more',
  imports: [],
  template: `
    <div class="pagination">
      <button type="button" class="btn btn-outline" [disabled]="loading()" (click)="load.emit()">
        {{ loading() ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  `,
  styles: [],
})
export class LoadMoreComponent {
  readonly loading = input(false);
  readonly load = output<void>();
}
