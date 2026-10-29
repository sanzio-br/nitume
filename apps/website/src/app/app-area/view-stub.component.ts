// Route stub for views of later issues (#7–#18, auth-foundation §2): the
// nav label as a top-bar h1, or only a skeleton card. No copy of its own.
// Each later issue replaces its stub.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NmSkeletonCard } from '../shared/ui/states/skeleton-card.component';
import { NmTopBar } from '../shared/ui/top-bar/top-bar.component';

@Component({
  selector: 'app-view-stub',
  imports: [NmTopBar, NmSkeletonCard],
  template: `
    @if (label; as title) {
      <nm-top-bar [title]="title" />
    } @else {
      <nm-skeleton-card />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewStubComponent {
  protected readonly label =
    ((inject(ActivatedRoute).snapshot.data as { stubLabel?: unknown }).stubLabel as string | undefined) ?? null;
}
