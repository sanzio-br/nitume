import { Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { apiError, FORBIDDEN_COPY } from '../../../core/api-error';
import type { VerificationDocumentLink } from '../../../core/api-types';
import { ImageViewerComponent } from '../../../shared/image-viewer.component';
import { AdminDataService } from '../admin-data.service';
import { QueueCheck, purgedAtOf } from '../verification-labels';

type PreviewState = 'loading' | 'shown' | 'unavailable' | 'error' | 'forbidden';

/**
 * Inline image of one stored ID side / selfie in the documents drawer
 * (`drawer-runner-verification` Image block, A-18 frame; rows 278, 279).
 * Mounted only for a stored image (`hasDocument`, not purged), so it asks
 * for the signed link once when the drawer shows it; every call is logged
 * by the API. The link lives only in this component and is gone when it is
 * destroyed (drawer closed or switched). A new link is asked only when the
 * image must be requested again after `expiresAt` (one automatic retry per
 * open), on `Try again`, or when the viewer opens after `expiresAt`.
 */
@Component({
  selector: 'app-verification-document-preview',
  imports: [ImageViewerComponent],
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="doc-preview is-loading" aria-busy="true">
          <span class="doc-preview-wait">Loading image…</span>
        </div>
      }
      @case ('shown') {
        <button
          type="button"
          class="doc-preview"
          [class.is-loading]="!loaded()"
          [attr.aria-label]="'Open ' + label() + ' image for ' + runner() + ' full size'"
          (click)="openViewer()"
        >
          <img
            [src]="url()"
            [alt]="label() + ' for ' + runner()"
            referrerpolicy="no-referrer"
            decoding="async"
            (load)="loaded.set(true)"
            (error)="imageFailed()"
          />
        </button>
      }
      @case ('unavailable') {
        <span class="cell-caption">Image preview isn't available in this environment.</span>
      }
      @case ('forbidden') {
        <span class="cell-caption">{{ forbiddenCopy }}</span>
      }
      @case ('error') {
        <div class="doc-preview-error">
          <span class="cell-caption">Couldn't load the image.</span>
          <button
            type="button"
            class="btn btn-text btn-sm"
            [attr.aria-label]="'Try again: ' + label() + ' image for ' + runner()"
            (click)="retry()"
          >
            Try again
          </button>
        </div>
      }
    }
    @if (viewerOpen()) {
      <app-image-viewer
        [src]="viewerSrc()"
        [label]="label() + ' · ' + runner()"
        [alt]="label() + ' for ' + runner()"
        (closed)="closeViewer()"
      />
    }
  `,
  styles: [':host { display: block; }'],
})
export class VerificationDocumentPreviewComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly s = inject(AdminDataService);

  /** The newest record of the check, in the Stored state. */
  readonly check = input.required<QueueCheck>();
  /** Check label (`National ID · Front`). */
  readonly label = input.required<string>();
  /** Runner label (short name, else short id). */
  readonly runner = input.required<string>();

  protected readonly state = signal<PreviewState>('loading');
  protected readonly loaded = signal(false);
  protected readonly viewerOpen = signal(false);
  protected readonly viewerSrc = signal<string | null>(null);
  protected readonly forbiddenCopy = FORBIDDEN_COPY;

  /** The live link: component state only, never the store, storage or an href. */
  private readonly link = signal<{ url: string; expiresAt: number } | null>(null);
  /** One automatic new link per image per open. */
  private retried = false;
  private seq = 0;
  private destroyed = false;

  protected readonly url = () => this.link()?.url ?? '';

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.link.set(null);
    this.viewerSrc.set(null);
  }

  /** `Try again`: one logged call per click. */
  protected retry(): void {
    void this.load();
  }

  /** The browser could not show the image: ask once more only if the link had expired. */
  protected imageFailed(): void {
    const l = this.link();
    if (l && Date.now() >= l.expiresAt && !this.retried) {
      this.retried = true;
      void this.load();
      return;
    }
    this.state.set('error');
  }

  /** The viewer reuses the live link; after `expiresAt` it asks for a new one first. */
  protected async openViewer(): Promise<void> {
    const l = this.link();
    this.viewerOpen.set(true);
    if (l && Date.now() < l.expiresAt) {
      this.viewerSrc.set(l.url);
      return;
    }
    this.viewerSrc.set(null);
    const fresh = await this.fetch();
    if (this.destroyed || !this.viewerOpen()) return;
    if (fresh) {
      this.viewerSrc.set(fresh.url);
    } else {
      this.closeViewer();
    }
  }

  protected closeViewer(): void {
    this.viewerOpen.set(false);
    this.viewerSrc.set(null);
  }

  private async load(): Promise<void> {
    this.state.set('loading');
    this.loaded.set(false);
    await this.fetch();
  }

  /**
   * One logged call. Sets the state from the answer; 410 / 404 missing
   * update the store record, which switches the block to Deleted / No
   * image. Returns the new link, or null.
   */
  private async fetch(): Promise<{ url: string; expiresAt: number } | null> {
    const id = this.check().id;
    const seq = ++this.seq;
    let res: VerificationDocumentLink;
    try {
      res = await firstValueFrom(this.api.verificationDocument(id));
    } catch (e) {
      if (this.destroyed || seq !== this.seq) return null;
      const err = apiError(e);
      if (err.status === 410) {
        this.s.markVerificationPurged(id, purgedAtOf(err.extra));
      } else if (err.status === 404 && err.code === 'verification_document_missing') {
        this.s.markVerificationMissing(id);
      } else {
        this.link.set(null);
        this.state.set(err.status === 403 ? 'forbidden' : 'error');
      }
      return null;
    }
    if (this.destroyed || seq !== this.seq) return null;
    if (!res.url) {
      this.link.set(null);
      this.state.set('unavailable');
      return null;
    }
    const expires = res.expiresAt ? new Date(res.expiresAt).getTime() : Number.NaN;
    const link = {
      url: res.url,
      expiresAt: Number.isNaN(expires) ? Number.POSITIVE_INFINITY : expires,
    };
    this.link.set(link);
    this.state.set('shown');
    return link;
  }
}
