// `nmTemplateOutlet`: renders a TemplateRef in place. A minimal stand-in
// for the common template-outlet directive, whose framework code would otherwise land in the
// marketing initial bundle (WQ-33, owner 2026-10-29). An optional context
// (#7: the dialog's template content) is passed to the embedded view.
import { Directive, OnChanges, TemplateRef, ViewContainerRef, inject, input } from '@angular/core';

@Directive({ selector: '[nmTemplateOutlet]' })
export class NmTemplateOutlet implements OnChanges {
  readonly nmTemplateOutlet = input.required<TemplateRef<unknown>>();
  readonly nmTemplateOutletContext = input<object | null>(null);

  private readonly container = inject(ViewContainerRef);

  ngOnChanges(): void {
    this.container.clear();
    this.container.createEmbeddedView(this.nmTemplateOutlet(), this.nmTemplateOutletContext() ?? undefined);
  }
}
