import {
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { apiError, FORBIDDEN_COPY } from '../../../core/api-error';
import type {
  AdminUserSummary,
  ChangeUserStatusResult,
  UserStatusHistoryItem,
} from '../../../core/api-types';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import { LoadMoreComponent } from '../../../shared/load-more.component';
import { AdminDataService } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import { formatDateTime, historyActor } from '../shared-format';
import { UserStatusDialogComponent } from './user-status-dialog';
import {
  ADMIN_ACCOUNT_COPY,
  AccountAction,
  AccountAudience,
  HISTORY_LOAD_ERROR,
  NOT_FOUND_COPY,
  OWN_ACCOUNT_COPY,
  STATUS_LOAD_ERROR,
  StatusChangeFailure,
  accountActions,
  accountLabel,
  actionCopy,
  blockedReason,
} from './user-status';

/** History page size (spec §3.1 item 5). */
export const HISTORY_PAGE = 20;

/**
 * `Account` section (drawer-user-status §3.1): the account's status chip,
 * the last change, Suspend / Ban / Reactivate by status (WQ-23) and the
 * status history. Placed last in the runner and customer drawers. Loads
 * the account (U-1) and the history independently; emits the account so a
 * drawer can show its name and phone without a second request.
 */
@Component({
  selector: 'app-user-status-section',
  imports: [
    StatusChipComponent,
    InlineNoticeComponent,
    LoadMoreComponent,
    UserStatusDialogComponent,
  ],
  template: `
    <section class="drawer-section">
      <div class="drawer-label" tabindex="-1" #label>Account</div>
      @if (notice(); as n) {
        <app-inline-notice
          [tone]="n.tone"
          [dismissible]="true"
          [autoDismissMs]="n.tone === 'success' ? 6000 : 0"
          (dismissed)="notice.set(null)"
          >{{ n.text }}</app-inline-notice
        >
      }
      @if (!missing()) {
        @if (userError(); as err) {
          <app-inline-notice tone="danger">
            {{ err }}
            @if (err !== forbidden) {
              <button
                notice-action
                type="button"
                class="btn btn-outline btn-sm"
                (click)="loadUser()"
              >
                Try again
              </button>
            }
          </app-inline-notice>
        } @else {
          <div class="drawer-card">
            <div class="drawer-row">
              <span>Status</span>
              <span class="account-status" tabindex="-1" #status>
                @if (user(); as u) {
                  <app-status-chip [status]="u.status" kind="account" />
                } @else {
                  <span class="val-muted">Loading…</span>
                }
              </span>
            </div>
            <div class="drawer-row">
              <span>Last changed</span>
              @if (historyLoading() || historyError()) {
                <b>—</b>
              } @else if (items()[0]; as last) {
                <span class="val-text"
                  ><span class="num">{{ formatDateTime(last.createdAt) }}</span> ·
                  {{ historyActor(last) }}</span
                >
              } @else {
                <span class="val-muted">No changes recorded</span>
              }
            </div>
          </div>
          @if (actions().length) {
            <div class="drawer-actions">
              @for (a of actions(); track a) {
                <button type="button" class="btn btn-outline" (click)="dialogAction.set(a)">
                  {{ buttonLabel(a) }}
                </button>
              }
            </div>
          } @else if (blockedText(); as text) {
            <p class="drawer-muted blocked">{{ text }}</p>
          }
        }

        <div class="drawer-label history-label">Status history</div>
        @if (historyLoading()) {
          <div class="ops-loading">Loading history…</div>
        } @else {
          @if (items().length || !historyError()) {
            <div class="drawer-timeline">
              @for (item of items(); track item.id) {
                <div class="dt-item">
                  <b>{{ accountLabel(item.fromStatus) }} → {{ accountLabel(item.toStatus) }}</b>
                  <span class="dt-time"
                    ><span class="dt-actor">{{ historyActor(item) }}</span> ·
                    {{ formatDateTime(item.createdAt) }}</span
                  >
                  <span class="dt-time"
                    ><span class="dt-actor">“{{ item.reason }}”</span></span
                  >
                </div>
              } @empty {
                <div class="dt-item"><b>No status changes yet.</b></div>
              }
            </div>
          }
          @if (historyError(); as err) {
            <app-inline-notice tone="danger">
              {{ err }}
              @if (err !== forbidden) {
                <button
                  notice-action
                  type="button"
                  class="btn btn-text btn-sm"
                  (click)="retryHistory()"
                >
                  Try again
                </button>
              }
            </app-inline-notice>
          } @else if (nextCursor()) {
            <app-load-more [loading]="moreLoading()" (load)="loadMore()" />
          }
        }
      }
    </section>

    <app-user-status-dialog
      [open]="dialogAction() !== null"
      [userId]="userId()"
      [action]="dialogAction() ?? 'suspend'"
      [audience]="audience()"
      (closed)="dialogAction.set(null)"
      (changed)="onChanged($event)"
      (failed)="onFailed($event)"
    />
  `,
  styles: [
    `
      /* Spec §3.3: two labels can overflow a narrow drawer, so they wrap;
         keep the A-07 size (about 44px tall), not the mockup's 12.5/9. */
      .drawer-actions {
        flex-wrap: wrap;
      }
      .drawer-actions .btn {
        flex: 1 1 auto;
        font-size: 14.5px;
        padding: 12px 22px;
        border-radius: 999px;
        min-height: 44px;
      }
      .history-label {
        margin-top: 16px;
      }
      .blocked {
        margin: 6px 0 0;
      }
      .account-status:focus,
      .drawer-label:focus {
        outline: none;
      }
    `,
  ],
})
export class UserStatusSectionComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly s = inject(AdminDataService);
  private readonly nav = inject(DrawerNavService);
  private readonly injector = inject(Injector);

  /** The account's user id (runner: `RunnerListItem.userId`, never the profile id). */
  readonly userId = input.required<string>();
  readonly audience = input.required<AccountAudience>();

  /** The account summary (U-1) once loaded, for the drawer header. */
  readonly account = output<AdminUserSummary>();
  /** 404: the account doesn't exist. */
  readonly missingAccount = output<void>();

  protected readonly forbidden = FORBIDDEN_COPY;
  readonly user = signal<AdminUserSummary | null>(null);
  protected readonly userError = signal<string | null>(null);
  readonly items = signal<UserStatusHistoryItem[]>([]);
  readonly nextCursor = signal<string | null>(null);
  protected readonly historyLoading = signal(true);
  protected readonly moreLoading = signal(false);
  protected readonly historyError = signal<string | null>(null);
  /** Cursor of the page that failed (null = page 1), for `Try again`. */
  private failedCursor: string | null = null;
  protected readonly notice = signal<{ tone: NoticeTone; text: string } | null>(null);
  readonly dialogAction = signal<AccountAction | null>(null);
  /** Set by a 403/404 from the PATCH (spec §7). */
  private readonly failureBlock = signal<'self' | 'admin' | 'missing' | null>(null);
  private seq = 0;

  private readonly dialog = viewChild.required(UserStatusDialogComponent);
  private readonly label = viewChild<ElementRef<HTMLElement>>('label');
  private readonly status = viewChild<ElementRef<HTMLElement>>('status');

  private readonly meId = computed(() => this.s.me()?.id ?? this.auth.userId());
  protected readonly missing = computed(() => this.failureBlock() === 'missing');
  protected readonly blocked = computed(() => {
    const f = this.failureBlock();
    if (f === 'self' || f === 'admin') return f;
    return blockedReason(this.userId(), this.user()?.role, this.meId());
  });
  readonly actions = computed(() => accountActions(this.user()?.status, this.blocked()));
  protected readonly blockedText = computed(() => {
    switch (this.blocked()) {
      case 'self':
        return OWN_ACCOUNT_COPY;
      case 'admin':
        return ADMIN_ACCOUNT_COPY;
      default:
        return null;
    }
  });

  ngOnInit(): void {
    this.nav.setCloseGuard((proceed) => {
      const d = this.dialog();
      if (d.saving()) return false;
      if (!d.dirty()) return true;
      d.askDiscard(proceed);
      return false;
    });
    void this.loadUser();
    void this.loadHistory(null);
  }

  ngOnDestroy(): void {
    this.seq++;
  }

  async loadUser(): Promise<void> {
    const seq = this.seq;
    this.user.set(null);
    this.userError.set(null);
    try {
      const user = await firstValueFrom(this.api.adminUser(this.userId()));
      if (seq !== this.seq) return;
      this.user.set(user);
      this.account.emit(user);
    } catch (e) {
      if (seq !== this.seq) return;
      const err = apiError(e);
      if (err.status === 404) this.markMissing();
      else if (err.status === 403) this.userError.set(FORBIDDEN_COPY);
      else if (err.status !== 401) this.userError.set(STATUS_LOAD_ERROR);
    }
  }

  /** `cursor` null = page 1 (replaces the list); otherwise appends. */
  async loadHistory(cursor: string | null, retriedCursor = false): Promise<void> {
    const seq = this.seq;
    if (cursor) this.moreLoading.set(true);
    else this.historyLoading.set(true);
    this.historyError.set(null);
    try {
      const page = await firstValueFrom(
        this.api.userStatusHistory(this.userId(), cursor, HISTORY_PAGE),
      );
      if (seq !== this.seq) return;
      this.items.set(cursor ? [...this.items(), ...page.items] : page.items);
      this.nextCursor.set(page.nextCursor);
    } catch (e) {
      if (seq !== this.seq) return;
      const err = apiError(e);
      if (err.status === 400 && err.code === 'cursor_invalid' && cursor && !retriedCursor) {
        // A stale cursor: start again from page 1, once, without a notice.
        this.moreLoading.set(false);
        await this.reloadFirstPage();
        return;
      }
      if (err.status === 404) this.markMissing();
      else if (err.status === 403) this.historyError.set(FORBIDDEN_COPY);
      else if (err.status !== 401) {
        this.failedCursor = cursor;
        this.historyError.set(HISTORY_LOAD_ERROR);
      }
    } finally {
      if (seq === this.seq) {
        this.historyLoading.set(false);
        this.moreLoading.set(false);
      }
    }
  }

  /** Page 1 after a stale cursor; a second failure shows the generic notice. */
  private async reloadFirstPage(): Promise<void> {
    const seq = this.seq;
    this.historyLoading.set(true);
    try {
      const page = await firstValueFrom(
        this.api.userStatusHistory(this.userId(), null, HISTORY_PAGE),
      );
      if (seq !== this.seq) return;
      this.items.set(page.items);
      this.nextCursor.set(page.nextCursor);
    } catch (e) {
      if (seq !== this.seq) return;
      const err = apiError(e);
      if (err.status === 404) this.markMissing();
      else if (err.status === 403) this.historyError.set(FORBIDDEN_COPY);
      else if (err.status !== 401) {
        this.failedCursor = null;
        this.historyError.set(HISTORY_LOAD_ERROR);
      }
    } finally {
      if (seq === this.seq) this.historyLoading.set(false);
    }
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (cursor && !this.moreLoading()) void this.loadHistory(cursor);
  }

  protected retryHistory(): void {
    void this.loadHistory(this.failedCursor);
  }

  protected buttonLabel(a: AccountAction): string {
    return actionCopy(a, this.audience()).button;
  }

  /** 200 (spec §6): status from the response, change prepended, no refetch. */
  protected onChanged(res: ChangeUserStatusResult): void {
    const action = this.dialogAction()!;
    this.dialogAction.set(null);
    const u = this.user();
    if (u) this.user.set({ ...u, status: res.user.status });
    this.items.set([res.change, ...this.items()]);
    this.notice.set({ tone: 'success', text: actionCopy(action, this.audience()).success });
    afterNextRender(() => this.status()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Section-level failures (spec §7): close the dialog, show the notice. */
  protected onFailed(f: StatusChangeFailure & { kind: 'section' }): void {
    this.dialogAction.set(null);
    this.notice.set({ tone: f.tone, text: f.text });
    if (f.block === 'missing') this.markMissing(false);
    else if (f.block) this.failureBlock.set(f.block);
    if (f.reload) {
      void this.loadUser();
      void this.loadHistory(null);
    }
    afterNextRender(() => this.label()?.nativeElement.focus(), { injector: this.injector });
  }

  private markMissing(notice = true): void {
    this.failureBlock.set('missing');
    if (notice) this.notice.set({ tone: 'danger', text: NOT_FOUND_COPY });
    this.missingAccount.emit();
  }

  protected readonly accountLabel = accountLabel;
  protected readonly historyActor = historyActor;
  protected readonly formatDateTime = formatDateTime;
}
