import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerProfile } from './customer-profile.entity';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(CustomerProfile)
    private readonly profiles: Repository<CustomerProfile>,
  ) {}

  async createForUser(userId: string): Promise<CustomerProfile> {
    const existing = await this.profiles.findOne({ where: { userId } });
    if (existing) {
      return existing;
    }
    return this.profiles.save(this.profiles.create({ userId }));
  }

  async getByUserId(userId: string): Promise<CustomerProfile> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Customer profile not found');
    }
    return profile;
  }

  async updateDefaults(userId: string, defaultAddressText: string | null): Promise<CustomerProfile> {
    const profile = await this.getByUserId(userId);
    profile.defaultAddressText = defaultAddressText;
    return this.profiles.save(profile);
  }

  async ensureProfile(userId: string): Promise<CustomerProfile> {
    try {
      return await this.getByUserId(userId);
    } catch {
      throw new ConflictException('User does not have a customer profile');
    }
  }
}