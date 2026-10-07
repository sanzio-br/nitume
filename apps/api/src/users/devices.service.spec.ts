import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DevicePlatform } from '../common/enums';
import { Device } from './device.entity';
import { DevicesService } from './devices.service';

const repo = (existing: Device | null, affected = 1) => ({
  delete: vi.fn(() => Promise.resolve({ affected })),
  findOne: vi.fn(() => Promise.resolve(existing)),
  find: vi.fn(() => Promise.resolve([])),
  create: vi.fn((row: Partial<Device>) => row),
  save: vi.fn((row: Partial<Device>) => Promise.resolve({ id: 'd-1', ...row })),
});

const dto = { platform: DevicePlatform.ANDROID, pushToken: 'fcm-token' };

describe('DevicesService (A-13)', () => {
  it('creates a device for a new token and detaches it from other users', async () => {
    const devices = repo(null);
    const service = new DevicesService(devices as never);

    const saved = await service.register('u-1', dto);

    expect(devices.delete).toHaveBeenCalledWith(
      expect.objectContaining({ pushToken: 'fcm-token' }),
    );
    expect(devices.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', platform: 'android', pushToken: 'fcm-token' }),
    );
    expect(saved.lastSeenAt).toBeInstanceOf(Date);
  });

  it('refreshes lastSeenAt on re-registration instead of duplicating', async () => {
    const existing = {
      id: 'd-9',
      userId: 'u-1',
      platform: DevicePlatform.IOS,
      pushToken: 'fcm-token',
      lastSeenAt: null,
    } as Device;
    const devices = repo(existing);
    const service = new DevicesService(devices as never);

    const saved = await service.register('u-1', dto);

    expect(devices.create).not.toHaveBeenCalled();
    expect(saved.id).toBe('d-9');
    expect(saved.platform).toBe(DevicePlatform.ANDROID);
    expect(saved.lastSeenAt).toBeInstanceOf(Date);
  });

  it('only removes devices owned by the caller', async () => {
    const devices = repo(null, 0);
    const service = new DevicesService(devices as never);
    await expect(service.remove('u-1', 'd-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(devices.delete).toHaveBeenCalledWith({ id: 'd-1', userId: 'u-1' });
  });
});
