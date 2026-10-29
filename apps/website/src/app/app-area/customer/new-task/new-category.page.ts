// customer `v-new-category` (customer-v-new-category.md): wizard step 1.
// Pick one of the five MVP categories; `Continue →` is disabled until one
// is chosen. Back with data asks the discard confirm before navigating
// (mobile `_back`), so the leave guard does not ask twice.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NmBackEvent } from '../../../shared/ui/back-button/back-button.component';
import { NmButton } from '../../../shared/ui/button/button.component';
import { NmSectionLabel } from '../../../shared/ui/card/section-label.component';
import { NmCategoryGrid } from '../../../shared/ui/category/category-grid.component';
import { NmDialogService } from '../../../shared/ui/overlay/dialog.service';
import { NmWizardFrame } from '../../../shared/ui/wizard-frame/wizard-frame.component';
import { customerLinks } from '../customer-links';
import { CustomerErrandsApi } from '../data/errands.api';
import { TaskDraftStore, isWizardCategory } from './task-draft.store';
import { DISCARD_CONFIRM, discardDraft } from './wizard.guards';

@Component({
  selector: 'app-new-category-page',
  imports: [NmWizardFrame, NmSectionLabel, NmCategoryGrid, NmButton],
  template: `
    <nm-wizard-frame
      title="New task"
      [step]="1"
      [backFallback]="store.openerUrl"
      [unloadGuard]="unloadGuard"
      (back)="onBack($event)"
    >
      <section class="new-category">
        <nm-section-label class="new-category__label" [inset]="false"
          ><span id="new-category-label">What do you need done?</span></nm-section-label
        >
        <nm-category-grid
          class="new-category__grid"
          mode="select"
          labelledBy="new-category-label"
          [selected]="store.category()"
          (selectedChange)="select($event)"
        />
      </section>
      <nm-button nmWizardCta type="button" [expand]="true" [disabled]="!store.category()" (pressed)="continue()"
        >Continue →</nm-button
      >
    </nm-wizard-frame>
  `,
  styles: `
    :host {
      display: block;
    }

    .new-category__label {
      margin-top: -6px;
    }

    .new-category__grid {
      padding-bottom: 20px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewCategoryPage {
  protected readonly store = inject(TaskDraftStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(NmDialogService);
  private readonly api = inject(CustomerErrandsApi);

  protected readonly unloadGuard = () => this.store.hasData() && !this.store.submitted;

  protected select(category: string): void {
    if (isWizardCategory(category)) this.store.changeCategory(category);
  }

  protected continue(): void {
    if (this.store.category()) void this.router.navigateByUrl(customerLinks.newTaskDetails());
  }

  /** Back with data: confirm first, then discard and go to the opener. */
  protected async onBack(event: NmBackEvent): Promise<void> {
    if (!this.store.hasData()) return;
    event.preventDefault();
    if (!(await this.dialog.confirm(DISCARD_CONFIRM))) return;
    const opener = this.store.openerUrl;
    discardDraft(this.store, this.api);
    void this.router.navigateByUrl(opener);
  }
}
