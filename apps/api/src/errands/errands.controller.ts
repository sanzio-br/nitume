import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  ErrandStatus,
  ResolveDisputeVerdict,
  StatusHistoryActor,
  UserRole,
} from '../common/enums';
import {
  CreateErrandDto,
  ErrandStatusFilterDto,
  ListErrandsQueryDto,
  ResolveDisputeDto,
  RunnerNotesDto,
  TransitionErrandDto,
  UpdateErrandDto,
} from './dto/errand.dto';
import {
  ErrandResult,
  ErrandView,
  ErrandsService,
  ListErrandViewsResponse,
} from './errands.service';
import { Quote } from './quote.entity';

@Controller('errands')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.CUSTOMER, UserRole.RUNNER, UserRole.ADMIN)
export class ErrandsController {
  constructor(private readonly errands: ErrandsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateErrandDto,
  ) {
    return this.errands.createDraft(user.userId, dto, {
      type: StatusHistoryActor.CUSTOMER,
      id: user.userId,
    });
  }

  @Get()
  list(
    @CurrentUser() user: AuthContext,
    @Query() query: ListErrandsQueryDto,
  ): Promise<ListErrandViewsResponse> {
    return this.errands.listViewsFor(
      { role: user.role, userId: user.userId },
      { status: query.status, limit: query.limit, cursor: query.cursor },
    );
  }

  /** Count of errands visible to the caller (e.g. customer profile "Tasks"). */
  @Get('count')
  count(
    @CurrentUser() user: AuthContext,
    @Query() query: ErrandStatusFilterDto,
  ): Promise<{ count: number }> {
    return this.errands.countFor(
      { role: user.role, userId: user.userId },
      query.status,
    );
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<ErrandView> {
    return this.errands.getDetail(id, { role: user.role, userId: user.userId });
  }

  /** Owner customer (or admin) edits the optional title. */
  @Patch(':id')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
    @Body() dto: UpdateErrandDto,
  ): Promise<ErrandView> {
    return this.errands.updateTitle(id, dto.title ?? null, {
      role: user.role,
      userId: user.userId,
    });
  }

  /** Assigned runner writes the notes shown on the customer's evidence review. */
  @Patch(':id/runner-notes')
  @Roles(UserRole.RUNNER)
  runnerNotes(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
    @Body() dto: RunnerNotesDto,
  ): Promise<ErrandView> {
    return this.errands.setRunnerNotes(id, dto.runnerNotes ?? null, {
      role: user.role,
      userId: user.userId,
    });
  }

  /** Customer-readable quote breakdown (latest `quotes` row). */
  @Get(':id/quote')
  quote(@Param('id') id: string, @CurrentUser() user: AuthContext): Promise<Quote> {
    return this.errands.latestQuoteFor(id, { role: user.role, userId: user.userId });
  }

  @Get(':id/history')
  history(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.errands.getById(id, { role: user.role, userId: user.userId }).then(() =>
      this.errands.historyFor(id),
    );
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthContext): Promise<ErrandResult> {
    return this.errands.transition(
      id,
      ErrandStatus.REQUESTED,
      { type: StatusHistoryActor.CUSTOMER, id: user.userId },
      undefined,
      { role: user.role, userId: user.userId },
    );
  }

  /**
   * Generic transition endpoint. Access is enforced by the state machine's
   * actor check: a customer can only trigger customer-actor transitions, a
   * runner only runner-actor transitions, and an admin any admin-actor one.
   */
  @Patch(':id/status')
  @HttpCode(200)
  transition(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
    @Body() dto: TransitionErrandDto,
  ): Promise<ErrandResult> {
    const actorType: StatusHistoryActor = this.actorTypeFor(user.role);
    return this.errands.transition(
      id,
      dto.to,
      { type: actorType, id: user.userId },
      dto.note,
      { role: user.role, userId: user.userId },
    );
  }

  private actorTypeFor(role: UserRole): StatusHistoryActor {
    switch (role) {
      case UserRole.ADMIN:
        return StatusHistoryActor.ADMIN;
      case UserRole.RUNNER:
        return StatusHistoryActor.RUNNER;
      default:
        return StatusHistoryActor.CUSTOMER;
    }
  }

  /**
   * Admin-mediated dispute resolution. ADMIN only, with a written rationale.
   * `verdict: runner` → DISPUTED→COMPLETED (normal payout process follows);
   * `verdict: customer` → DISPUTED→CANCELLED (opens a refund review if the
   * customer had paid).
   */
  @Roles(UserRole.ADMIN)
  @Patch(':id/resolve-dispute')
  @HttpCode(200)
  resolveDispute(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
    @Body() dto: ResolveDisputeDto,
  ): Promise<ErrandResult> {
    const verdict: 'runner_favourable' | 'customer_favourable' =
      dto.verdict === ResolveDisputeVerdict.RUNNER
        ? 'runner_favourable'
        : 'customer_favourable';
    return this.errands.resolveDispute(
      id,
      verdict,
      dto.rationale,
      user,
    );
  }
}