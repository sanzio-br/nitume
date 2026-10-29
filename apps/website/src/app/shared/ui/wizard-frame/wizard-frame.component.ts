// `nm-wizard-frame` (customer-v-new-category §W4): one frame for the three
// task-wizard steps. The #6 `nm-pushed-header` (title, `Step n of 3`, Back),
// `nm-stepper`, the body, then `nm-fixed-cta` holding `[nmWizardAbove]` and
// `[nmWizardCta]`. Full width below 768px; one centred 640px column from
// 768px. While `unloadGuard()` is true, closing or reloading the tab asks
// the browser's own leave prompt (§W3); the listener goes with the frame.
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NmBackEvent } from '../back-button/back-button.component';
import { NmFixedCta } from '../fixed-cta/fixed-cta.component';
import { NmPushedHeader } from '../pushed-header/pushed-header.component';
import { NmStepper } from '../stepper/stepper.component';

export const WIZARD_STEPS = 3;

@Component({
  selector: 'nm-wizard-frame',
  imports: [NmPushedHeader, NmStepper, NmFixedCta],
  template: `
    <div class="nm-wizard-frame" [style.--nm-cta-scroll-margin.px]="scrollMargin()">
      <nm-pushed-header
        class="nm-wizard-frame__header"
        [title]="title()"
        [step]="step()"
        [steps]="steps"
        [fallback]="backFallback()"
        [backDisabled]="backDisabled()"
        (back)="back.emit($event)"
      />
      <nm-stepper [total]="steps" [completed]="step()" />
      <div class="nm-wizard-frame__body"><ng-content /></div>
      <nm-fixed-cta (heightChange)="ctaHeight.set($event)">
        <ng-container ngProjectAs="[nmCtaAbove]"><ng-content select="[nmWizardAbove]" /></ng-container>
        <ng-content select="[nmWizardCta]" />
      </nm-fixed-cta>
    </div>
  `,
  styleUrl: './wizard-frame.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class NmWizardFrame {
  readonly title = input.required<string>();
  /** 1–3. */
  readonly step = input.required<number>();
  readonly backDisabled = input(false);
  /** Back target when the previous page is not inside `/app`. */
  readonly backFallback = input<string | null>(null);
  /** Read when the tab is closed or reloaded (`hasData && !submitted`). */
  readonly unloadGuard = input<(() => boolean) | null>(null);

  /** Re-emits the header's back event (call `preventDefault()` to handle it). */
  readonly back = output<NmBackEvent>();

  protected readonly steps = WIZARD_STEPS;
  protected readonly ctaHeight = signal(0);
  /** A focused field stays clear of the fixed bar (bar height + 16px). */
  protected readonly scrollMargin = computed(() => this.ctaHeight() + 16);

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.unloadGuard()?.()) event.preventDefault();
  }
}
