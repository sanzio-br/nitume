import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole, GeoPoint } from '../common/enums';
import { Errand } from '../errands/errand.entity';
import { ErrandAssignment } from '../errands/errand-assignment.entity';
import { RunnerProfile } from '../runners/runner-profile.entity';
import { ErrandsService } from '../errands/errands.service';
import { Evidence } from './evidence.entity';
import { EVIDENCE_STORAGE } from './evidence-storage/evidence-storage.provider';
import { EvidenceStorage } from './evidence-storage/evidence-storage.interface';
import { CreateEvidenceDto, EvidenceViewerContext } from './dto/evidence.dto';

@Injectable()
export class EvidenceService {
  constructor(
    @InjectRepository(Evidence)
    private readonly evidence: Repository<Evidence>,
    @InjectRepository(Errand)
    private readonly errands: Repository<Errand>,
    @InjectRepository(ErrandAssignment)
    private readonly assignments: Repository<ErrandAssignment>,
    @InjectRepository(RunnerProfile)
    private readonly runners: Repository<RunnerProfile>,
    private readonly errandService: ErrandsService,
    @Inject(EVIDENCE_STORAGE)
    private readonly storage: EvidenceStorage,
  ) {}

  /**
   * Upload evidence for an errand. The current user must own the errand
   * (customer) or hold an active assignment (runner); admins may attach
   * evidence during mediation. Bytes go through the configured storage
   * driver (console in dev, Cloudinary once credentials are set).
   */
  async upload(
    errandId: string,
    dto: CreateEvidenceDto,
    viewer: EvidenceViewerContext,
  ): Promise<Evidence> {
    const errand = await this.errands.findOne({ where: { id: errandId } });
    if (!errand) {
      throw new NotFoundException('Errand not found');
    }
    const permitted = await this.hasAccess(errand, viewer);
    if (!permitted) {
      throw new ForbiddenException('You do not have access to this errand');
    }

    const data = Buffer.from(dto.data, 'base64');
    if (data.length === 0) {
      throw new BadRequestException('Evidence data must not be empty');
    }
    const isImage = dto.contentType.startsWith('image/');
    const isVideo = dto.contentType.startsWith('video/');
    if (!isImage && !isVideo && dto.contentType !== 'application/pdf') {
      throw new BadRequestException(
        'Only image, video, or PDF evidence is supported',
      );
    }

    const uploaded = await this.storage.upload({
      data,
      contentType: dto.contentType,
      errandId,
    });

    const row = this.evidence.create({
      errandId,
      type: dto.type,
      s3Key: uploaded.key,
      url: uploaded.url || null,
      capturedAtLocation: dto.lat !== undefined && dto.lon !== undefined
        ? pointToGeo(dto.lat, dto.lon)
        : null,
      capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : new Date(),
      uploadedBy: viewer.userId,
    });
    return this.evidence.save(row);
  }

  async listForErrand(
    errandId: string,
    viewer: EvidenceViewerContext,
  ): Promise<Evidence[]> {
    const errand = await this.errands.findOne({ where: { id: errandId } });
    if (!errand) {
      throw new NotFoundException('Errand not found');
    }
    if (!(await this.hasAccess(errand, viewer))) {
      throw new ForbiddenException('You do not have access to this errand');
    }
    const rows = await this.evidence.find({
      where: { errandId },
      order: { createdAt: 'DESC' },
    });
    return rows;
  }

  /** Customer (owner), assigned runner, or admin may view/attach. */
  private async hasAccess(
    errand: Errand,
    viewer: EvidenceViewerContext,
  ): Promise<boolean> {
    if (viewer.role === UserRole.ADMIN) {
      return true;
    }
    if (viewer.role === UserRole.RUNNER) {
      const runner = await this.runners.findOne({ where: { userId: viewer.userId } });
      if (!runner) {
        return false;
      }
      const assignment = await this.assignments.findOne({
        where: { errandId: errand.id, runnerProfileId: runner.id },
      });
      return assignment !== null;
    }
    const owner = await this.errandService.getCustomerProfileId(viewer.userId);
    return owner === errand.customerId;
  }
}

const pointToGeo = (lat: number, lon: number): GeoPoint => ({
  type: 'Point',
  coordinates: [lon, lat],
});