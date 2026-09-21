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
import { CreateRatingDto } from './dto/rating.dto';
import { Rating } from './rating.entity';
import { RatingsService } from './ratings.service';

@Controller('errands/:errandId/rating')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.CUSTOMER, UserRole.RUNNER, UserRole.ADMIN)
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post()
  rate(
    @Param('errandId') errandId: string,
    @Body() dto: CreateRatingDto,
    @CurrentUser() user: AuthContext,
  ): Promise<Rating> {
    return this.ratings.rate(errandId, dto, { userId: user.userId, role: user.role });
  }

  @Get()
  getForErrand(@Param('errandId') errandId: string): Promise<Rating | null> {
    return this.ratings.getForErrand(errandId);
  }
}