import { Injectable, NotFoundException } from '@nestjs/common';
import { conflict } from '../common/api-error';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

  /** Profiles by profile id (missing ids are omitted). */
  async findByIds(ids: string[]): Promise<CustomerProfile[]> {
    const unique = [...new Set(ids)].filter(Boolean);
    return unique.length === 0 ? [] : this.profiles.find({ where: { id: In(unique) } });
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
      throw conflict('customer_profile_missing', 'User does not have a customer profile');
    }
  }
}