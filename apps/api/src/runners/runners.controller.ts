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
  ReviewVerificationDto,
  UploadVerificationDocumentDto,
  SetAvailabilityDto,
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

  @UseGuards(JwtAuthGuard)
  @Patch(':runnerId/verifications/:verificationId')
  @Roles(UserRole.ADMIN)
  reviewVerification(
    @Param('runnerId') _runnerId: string,
    @Param('verificationId') verificationId: string,
    @CurrentUser() user: AuthContext,
    @Body() dto: ReviewVerificationDto,
  ) {
    return this.runners.reviewVerification(
      verificationId,
      { decision: dto.decision, reviewerNote: dto.reviewerNote },
      user.userId,
    );
  }

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

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @Roles(UserRole.RUNNER, UserRole.CUSTOMER, UserRole.ADMIN)
  getMine(@CurrentUser() user: AuthContext) {
    return this.runners.profileByUserId(user.userId);
  }

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
   * with `verificationType` (`government_id` | `selfie`) to restricted
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
    return this.runners.uploadVerificationDocument(user.userId, dto.verificationType, file, ip ?? null);
  }

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