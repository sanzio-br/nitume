import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrandStatus, UserRole } from '../common/enums';
import { Errand } from '../errands/errand.entity';
import { ErrandAssignment } from '../errands/errand-assignment.entity';
import { RunnerProfile } from '../runners/runner-profile.entity';
import { ErrandsService } from '../errands/errands.service';
import { Rating } from './rating.entity';
import { CreateRatingDto } from './dto/rating.dto';

const RATEABLE = new Set([
  ErrandStatus.COMPLETED,
  ErrandStatus.CONFIRMED,
  ErrandStatus.SETTLED,
]);

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private readonly ratings: Repository<Rating>,
    @InjectRepository(Errand)
    private readonly errands: Repository<Errand>,
    @InjectRepository(ErrandAssignment)
    private readonly assignments: Repository<ErrandAssignment>,
    @InjectRepository(RunnerProfile)
    private readonly runners: Repository<RunnerProfile>,
    private readonly errandService: ErrandsService,
  ) {}

  async rate(
    errandId: string,
    dto: CreateRatingDto,
    actor: { userId: string; role: UserRole },
  ): Promise<Rating> {
    const errand = await this.errands.findOne({ where: { id: errandId } });
    if (!errand) {
      throw new NotFoundException('Errand not found');
    }

    if (actor.role !== UserRole.ADMIN) {
      const ownerId = await this.errandService.getCustomerProfileId(actor.userId);
      if (ownerId !== errand.customerId) {
        throw new ForbiddenException('Only the task owner can rate this task');
      }
    }

    if (!RATEABLE.has(errand.status)) {
      throw new ConflictException(
        `Tasks can only be rated once they are complete (current: ${errand.status})`,
      );
    }

    const existing = await this.ratings.findOne({ where: { errandId } });
    if (existing) {
      throw new ConflictException('This task has already been rated');
    }

    const rateeUserId = await this.runnerUserIdFor(errandId);
    if (!rateeUserId) {
      throw new ConflictException('No assigned runner to rate');
    }

    const rating = this.ratings.create({
      errandId,
      raterUserId: actor.userId,
      rateeUserId,
      score: dto.score,
      comment: dto.comment ?? null,
    });
    return this.ratings.save(rating);
  }

  async getForErrand(errandId: string): Promise<Rating | null> {
    return this.ratings.findOne({ where: { errandId } });
  }

  /** User id (not profile id) of the runner assigned to an errand. */
  private async runnerUserIdFor(errandId: string): Promise<string | null> {
    const assignment = await this.assignments.findOne({
      where: { errandId },
      order: { createdAt: 'ASC' },
    });
    if (!assignment) {
      return null;
    }
    const runner = await this.runners.findOne({
      where: { id: assignment.runnerProfileId },
    });
    return runner?.userId ?? null;
  }
}