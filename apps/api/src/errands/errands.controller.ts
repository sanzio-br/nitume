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
  ListErrandsQueryDto,
  ResolveDisputeDto,
  TransitionErrandDto,
} from './dto/errand.dto';
import {
  ErrandResult,
  ErrandsService,
  ListErrandsResponse,
} from './errands.service';

@Controller('errands')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.CUSTOMER, UserRole.RUNNER, UserRole.ADMIN)
export class ErrandsController {
  constructor(private readonly errands: ErrandsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateErrandDto,
  ): Promise<ErrandResult> {
    return this.errands.createDraft(user.userId, dto, {
      type: StatusHistoryActor.CUSTOMER,
      id: user.userId,
    });
  }

  @Get()
  list(
    @CurrentUser() user: AuthContext,
    @Query() query: ListErrandsQueryDto,
  ): Promise<ListErrandsResponse> {
    return this.errands.listFor(
      { role: user.role, userId: user.userId },
      { status: query.status, limit: query.limit, cursor: query.cursor },
    );
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.errands.getById(id, { role: user.role, userId: user.userId });
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
   * Admin-mediated dispute resolution (§3.3 mediation, §A.6 audit). ADMIN only.
   * The verdict is written through the state machine's DISPUTED→CONFIRMED
   * (runner-favourable, split ledger still settles) or DISPUTED→CANCELLED
   * (customer-favourable, escrow legs reversed) transition, so this escapes the
   * otherwise-terminal DISPUTED deadlock my settlement-guard audit flagged (§A.4).
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