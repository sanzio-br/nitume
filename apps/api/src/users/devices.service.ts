import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Device } from './device.entity';
import { RegisterDeviceDto } from './dto/register-device.dto';

/**
 * Push-token registry backing the ERD `DEVICES` table. Registration is an
 * upsert on (userId, pushToken): re-registering refreshes `lastSeenAt`. A
 * token can only belong to one user, so registering a token that another
 * account held (shared phone, re-login) detaches it from that account.
 */
@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly devices: Repository<Device>,
  ) {}

  async register(userId: string, dto: RegisterDeviceDto): Promise<Device> {
    await this.devices.delete({ pushToken: dto.pushToken, userId: Not(userId) });
    const existing = await this.devices.findOne({
      where: { userId, pushToken: dto.pushToken },
    });
    const now = new Date();
    if (existing) {
      existing.platform = dto.platform;
      existing.lastSeenAt = now;
      return this.devices.save(existing);
    }
    return this.devices.save(
      this.devices.create({
        userId,
        platform: dto.platform,
        pushToken: dto.pushToken,
        lastSeenAt: now,
      }),
    );
  }

  /** Unregister (e.g. on logout). Only the owning user can remove a device. */
  async remove(userId: string, deviceId: string): Promise<void> {
    const result = await this.devices.delete({ id: deviceId, userId });
    if (!result.affected) {
      throw new NotFoundException('Device not found');
    }
  }

  /** Push tokens registered for a user (for the notification worker). */
  async pushTokensFor(userId: string): Promise<string[]> {
    const rows = await this.devices.find({ where: { userId, pushToken: Not(IsNull()) } });
    return [...new Set(rows.map((d) => d.pushToken).filter((t): t is string => !!t))];
  }

  /**
   * Drops devices whose token the push provider reported as dead
   * (unregistered/invalid), so they are never retried.
   */
  async removeStaleTokens(tokens: string[]): Promise<number> {
    if (tokens.length === 0) {
      return 0;
    }
    const result = await this.devices.delete({ pushToken: In(tokens) });
    return result.affected ?? 0;
  }
}
