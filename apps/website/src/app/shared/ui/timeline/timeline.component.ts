// `nm-timeline` (ui-kit spec §4.6; Flutter StatusTimeline C-19).
// Customer step titles come from `customerTimelineTitle()`; times from the
// §5 pipes.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NmNum } from '../../format/num.directive';

export interface NmTimelineStep {
  readonly title: string;
  readonly time?: string | null;
  readonly done: boolean;
}

@Component({
  selector: 'nm-timeline',
  imports: [NmNum],
  template: `
    <ol class="nm-tl">
      @for (step of steps(); track $index; let last = $last) {
        <li class="nm-tl__step" [attr.aria-label]="stepLabel(step)">
          <span class="nm-tl__rail" aria-hidden="true">
            <span class="nm-tl__dot" [class.nm-tl__dot--done]="step.done"></span>
            @if (!last) {
              <span class="nm-tl__connector"></span>
            }
          </span>
          <span class="nm-tl__text" aria-hidden="true">
            <span class="nm-tl__title">{{ step.title }}</span>
            @if (step.time) {
              <span class="nm-tl__time" nmNum="meta">{{ step.time }}</span>
            }
          </span>
        </li>
      }
    </ol>
  `,
  styleUrl: './timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmTimeline {
  readonly steps = input.required<readonly NmTimelineStep[]>();

  /** `title, time, done|pending`. */
  protected stepLabel(step: NmTimelineStep): string {
    return [step.title, step.time, step.done ? 'done' : 'pending']
      .filter((p): p is string => !!p)
      .join(', ');
  }
}
