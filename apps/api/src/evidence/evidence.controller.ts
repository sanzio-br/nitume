import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import {
  CreateEvidenceDto,
  EvidenceViewerContext,
  UploadEvidenceParamsDto,
} from './dto/evidence.dto';
import { Evidence } from './evidence.entity';
import { EvidenceService } from './evidence.service';

@Controller('errands/:errandId/evidence')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.CUSTOMER, UserRole.RUNNER, UserRole.ADMIN)
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Post()
  upload(
    @Param() params: UploadEvidenceParamsDto,
    @Body() dto: CreateEvidenceDto,
    @CurrentUser() user: AuthContext,
  ): Promise<Evidence> {
    return this.evidence.upload(params.errandId, dto, this.viewer(user));
  }

  @Get()
  list(
    @Param() params: UploadEvidenceParamsDto,
    @CurrentUser() user: AuthContext,
  ): Promise<Evidence[]> {
    return this.evidence.listForErrand(params.errandId, this.viewer(user));
  }

  private viewer(user: AuthContext): EvidenceViewerContext {
    return { userId: user.userId, role: user.role };
  }
}