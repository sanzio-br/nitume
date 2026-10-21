import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthContext, Public, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import {
  AddVerificationDto,
  ListVerificationsQueryDto,
  ReReviewVerificationDto,
  ReviewVerificationDto,
  UploadVerificationDocumentDto,
  SetAvailabilityDto,
  VerificationQueueQueryDto,
  SetServiceAreasDto,
  SetSkillsDto,
} from './dto/runner-actions.dto';
import {
  PublicRunnerProfile,
  RunnersService,
  UploadedImage,
} from './runners.service';

import { VerificationUploadTooLargeFilter } from './upload/verification-upload';

@Controller('runners')
export class RunnersController {
  constructor(private readonly runners: RunnersService) {}

  @Public()
  @Get(':id/profile')
  getPublicProfile(@Param('id') id: string): Promise<PublicRunnerProfile> {
    return this.runners.publicProfile(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @Roles(UserRole.ADMIN)
  list(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.runners.listForAdmin({
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      cursor: cursor ?? null,
    });
  }

  /**
   * Admin decision on one pending check, `{ decision, reviewerNote? }`.
   * `:runnerId` is the runner profile id. `reviewerNote` (row 262) is
   * optional and internal (never sent to the runner): trimmed, blank ->
   * null, at most 500 characters. 200 with the same item shape as
   * `GET /runners/verifications` (user, runnerProfile, side, hasDocument,
   * purgedAt, reviewer, reReviews), so the client can replace its item.
   * Approving an ID side or the selfie moves a `1_basic` runner to
   * `2_id_verified` once the newest ID front, ID back and selfie are all
   * approved (row 261), in the same transaction; a rejection never changes
   * the level. Errors: 400 for a malformed id; 400 reviewer_note_invalid
   * (`maxLength`); 404 when the verification is unknown or belongs to
   * another runner; 409 verification_already_decided (`status`).
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':runnerId/verifications/:verificationId')
  @Roles(UserRole.ADMIN)
  reviewVerification(
    @Param('runnerId', ParseUUIDPipe) runnerId: string,
    @Param('verificationId', ParseUUIDPipe) verificationId: string,
    @CurrentUser() user: AuthContext,
    @Body() dto: ReviewVerificationDto,
  ) {
    return this.runners.reviewVerification(
      runnerId,
      verificationId,
      { decision: dto.decision, reviewerNote: dto.reviewerNote },
      user.userId,
    );
  }

  /**
   * Admin verification list, one item per check, newest first,
   * `?status=pending|approved|rejected&cursor&limit` -> `{ items, nextCursor }`.
   * Each item: the check (no storage key; `hasDocument`, `purgedAt`, `side`),
   * `runnerProfile { id, userId, verificationLevel, serviceAreas[{ id, name }],
   * appliedAt }`, `user { id, phone, displayName, shortName }` (row 260),
   * `reviewer`, `reReviews[]`.
   */
  @UseGuards(JwtAuthGuard)
  @Get('verifications')
  @Roles(UserRole.ADMIN)
  listAllVerifications(@Query() query: ListVerificationsQueryDto) {
    return this.runners.listVerificationsForAdmin({
      limit: query.limit,
      cursor: query.cursor,
      status: query.status,
    });
  }

  /**
   * Row 260: the admin verification queue, one item per runner,
   * `?status=pending|approved|rejected|all` (default `pending`) `&cursor&limit`
   * (1-100, default 20) -> `{ items, nextCursor, total, awaitingReviewCount }`.
   * Item: `{ runnerProfile { id, userId, verificationLevel, serviceAreas[{ id,
   * name }], appliedAt }, user { id, phone, displayName, shortName },
   * checks[] (every record of the runner, history included, newest first,
   * same shape as GET /runners/verifications items), pendingCount,
   * oldestPendingAt, verification { verified, checks[{ type, side, status }] } }`.
   * Runners with only phone records are left out. "Latest" = newest record
   * of each (type, side). `pending`: any latest record pending, oldest
   * pending first (A-9: a pending record superseded by a newer upload of
   * the same check is not counted); `rejected`: any latest record rejected; `approved`: every latest
   * record approved (both most recently decided first); `all`: most recent
   * submission first. `total`: runners matching the filter;
   * `pendingCount` / `oldestPendingAt` over latest records only;
   * `awaitingReviewCount`: runners with a latest record pending, whole queue.
   * Errors: 400 cursor_invalid (unreadable, or from another filter); 400 for
   * an unknown status or a limit outside 1-100.
   */
  @UseGuards(JwtAuthGuard)
  @Get('verifications/queue')
  @Roles(UserRole.ADMIN)
  verificationQueue(@Query() query: VerificationQueueQueryDto) {
    return this.runners.verificationQueueForAdmin({
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  /**
   * Admin only (rows 125, 154): a signed URL to a verification image, valid
   * at most 5 minutes (`expiresAt`); every call is logged with the admin and
   * IP. Errors: 404; 404 verification_document_missing; 410
   * verification_document_purged. `url` is null on the console driver.
   */
  @UseGuards(JwtAuthGuard)
  @Get('verifications/:verificationId/document')
  @Roles(UserRole.ADMIN)
  verificationDocument(
    @Param('verificationId', ParseUUIDPipe) verificationId: string,
    @CurrentUser() user: AuthContext,
    @Ip() ip: string,
  ) {
    return this.runners.documentLink(verificationId, user.userId, ip ?? null);
  }

  /**
   * Row 171: explicit, audited "Re-review evidence" on an already decided
   * ID/selfie verification (admin only), `{ note? }` (<= 500, optional).
   * 201 `{ verificationId, reReview { id, reviewedBy { id, displayName },
   * createdAt, note } }`. Logged as `re_review` with the admin, IP and time;
   * restarts the retention clock (viewing never does); never changes the
   * decision. Errors: 404; 409 verification_not_decided; 410
   * verification_document_purged; 404 verification_document_missing.
   */
  @UseGuards(JwtAuthGuard)
  @Post('verifications/:verificationId/re-review')
  @Roles(UserRole.ADMIN)
  reReviewDocument(
    @Param('verificationId', ParseUUIDPipe) verificationId: string,
    @Body() dto: ReReviewVerificationDto,
    @CurrentUser() user: AuthContext,
    @Ip() ip: string,
  ) {
    return this.runners.reReviewDocument(verificationId, user.userId, ip ?? null, dto.note);
  }

  /**
   * Row 116: the ops-configured service areas, `{ items: [{ id, name }] }`
   * by name. `PUT /runners/me/service-areas` takes these ids.
   */
  @UseGuards(JwtAuthGuard)
  @Get('service-areas')
  @Roles(UserRole.RUNNER, UserRole.ADMIN)
  serviceAreas() {
    return this.runners.serviceAreaOptions();
  }

  /**
   * RA-18: the runner's own view (`RunnerSelfView`): shortName, skills,
   * serviceAreas `[{ id, name }]`, availability, maxPurchaseAdvance and
   * `verification { verified, checks[{ type, side, status }] }`. No trust
   * score or stored location. 404 without a runner profile.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @Roles(UserRole.RUNNER, UserRole.CUSTOMER, UserRole.ADMIN)
  getMine(@CurrentUser() user: AuthContext) {
    return this.runners.selfView(user.userId);
  }

  /**
   * RA-8, RA-20: `{ availability: online | offline }` -> `RunnerSelfView`.
   * 400 availability_server_managed (busy); 403 runner_not_verified
   * (online before every required check is approved); 409
   * runner_on_active_job (offline while busy).
   */
  @UseGuards(JwtAuthGuard)
  @Patch('me/availability')
  @Roles(UserRole.RUNNER)
  setAvailability(
    @CurrentUser() user: AuthContext,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.runners.setAvailability(user.userId, dto.availability);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/verifications')
  @Roles(UserRole.RUNNER)
  addVerification(
    @CurrentUser() user: AuthContext,
    @Body() dto: AddVerificationDto,
  ) {
    return this.runners.addVerification(
      user.userId,
      dto.verificationType,
      dto.documentS3Key ?? null,
    );
  }

  /**
   * RA-7: multipart upload of an ID side or selfie (`file`, JPEG/PNG/WebP/HEIC)
   * with `verificationType` (`government_id` | `selfie`) and, for an ID,
   * `side` (`front` | `back`, row 195; 400 verification_document_side_invalid
   * when missing, invalid, or sent with a selfie) to restricted
   * storage; creates a pending verification (one per image: ID front and
   * back are two). The storage key is never returned. Errors: 400
   * verification_type_not_uploadable, verification_document_type_invalid,
   * verification_document_empty; 413 verification_document_too_large
   * (`maxBytes`, row 163; the limit is `runnerVerification.maxUploadBytes`
   * through the module's multer options, the only source).
   */
  @UseGuards(JwtAuthGuard)
  @Post('me/verifications/documents')
  @Roles(UserRole.RUNNER)
  @UseFilters(VerificationUploadTooLargeFilter)
  @UseInterceptors(FileInterceptor('file'))
  uploadVerificationDocument(
    @CurrentUser() user: AuthContext,
    @Body() dto: UploadVerificationDocumentDto,
    @UploadedFile() file: UploadedImage | undefined,
    @Ip() ip: string,
  ) {
    return this.runners.uploadVerificationDocument(user.userId, dto.verificationType, file, ip ?? null, dto.side);
  }

  /** The runner's own checks, newest first. Never carries `reviewerNote` or `reviewedBy` (row 262, A-8: internal). */
  @UseGuards(JwtAuthGuard)
  @Get('me/verifications')
  @Roles(UserRole.RUNNER)
  listVerifications(@CurrentUser() user: AuthContext) {
    return this.runners.verificationsByUserId(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/skills')
  @Roles(UserRole.RUNNER)
  setSkills(@CurrentUser() user: AuthContext, @Body() dto: SetSkillsDto) {
    return this.runners.setSkills(user.userId, dto.skills);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/service-areas')
  @Roles(UserRole.RUNNER)
  setServiceAreas(@CurrentUser() user: AuthContext, @Body() dto: SetServiceAreasDto) {
    return this.runners.setServiceAreas(user.userId, dto.areas);
  }
}