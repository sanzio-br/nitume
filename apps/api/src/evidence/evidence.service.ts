import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole, GeoPoint } from '../common/enums';
import { Errand } from '../errands/errand.entity';
import { ErrandsService } from '../errands/errands.service';
import { Evidence } from './evidence.entity';
import { EVIDENCE_STORAGE } from './evidence-storage/evidence-storage.provider';
import { EvidenceStorage } from './evidence-storage/evidence-storage.interface';
import { CreateEvidenceDto, EvidenceViewerContext } from './dto/evidence.dto';

/**
 * Evidence as returned to clients (row 25): `url` is a short-lived signed
 * link (null when the asset cannot be served, e.g. the console driver),
 * `urlExpiresAt` tells the app when to refetch. The storage key and any
 * permanent URL are never exposed.
 */
export type EvidenceView = Omit<Evidence, 's3Key' | 'url'> & {
  url: string | null;
  urlExpiresAt: Date | null;
};

@Injectable()
export class EvidenceService {
  constructor(
    @InjectRepository(Evidence)
    private readonly evidence: Repository<Evidence>,
    @InjectRepository(Errand)
    private readonly errands: Repository<Errand>,
    private readonly errandService: ErrandsService,
    @Inject(EVIDENCE_STORAGE)
    private readonly storage: EvidenceStorage,
    private readonly events: EventEmitter2,
    private readonly config?: ConfigService,
  ) {}

  private toView(row: Evidence): EvidenceView {
    const ttl = this.config?.get<number>('evidence.signedUrlTtlSeconds', 900) ?? 900;
    let signed: { url: string | null; expiresAt: Date | null } = { url: null, expiresAt: null };
    try {
      signed = this.storage.viewUrl(row.s3Key, row.url, ttl);
    } catch {
      // Storage not configured: the row is still listed, without a link.
    }
    const { s3Key: _key, url: _url, ...rest } = row;
    return { ...rest, url: signed.url, urlExpiresAt: signed.expiresAt };
  }

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
  ): Promise<EvidenceView> {
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
    const saved = await this.evidence.save(row);
    setImmediate(() => {
      this.events.emit('evidence.uploaded', {
        errandId,
        evidenceId: saved.id,
        type: saved.type,
        capturedAt: saved.capturedAt.toISOString(),
      });
    });
    return this.toView(saved);
  }

  async listForErrand(
    errandId: string,
    viewer: EvidenceViewerContext,
  ): Promise<EvidenceView[]> {
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
    return rows.map((row) => this.toView(row));
  }

  /** Customer (owner), the runner on the current assignment, or admin may view/attach. */
  private async hasAccess(
    errand: Errand,
    viewer: EvidenceViewerContext,
  ): Promise<boolean> {
    if (viewer.role === UserRole.ADMIN) {
      return true;
    }
    if (viewer.role === UserRole.RUNNER) {
      // Current assignment only (BOARD rows 27, 65).
      return this.errandService.isCurrentRunner(errand.id, viewer.userId);
    }
    const owner = await this.errandService.getCustomerProfileId(viewer.userId);
    return owner === errand.customerId;
  }
}

const pointToGeo = (lat: number, lon: number): GeoPoint => ({
  type: 'Point',
  coordinates: [lon, lat],
});