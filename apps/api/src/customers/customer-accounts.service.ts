import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateSavedAddressDto,
  UpdateSavedAddressDto,
} from './dto/address.dto';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto';
import { CustomerProfile } from './customer-profile.entity';
import { SavedAddress } from './saved-address.entity';
import { PaymentMethod } from './payment-method.entity';

@Injectable()
export class CustomerAccountsService {
  constructor(
    @InjectRepository(CustomerProfile)
    private readonly profiles: Repository<CustomerProfile>,
    @InjectRepository(SavedAddress)
    private readonly addresses: Repository<SavedAddress>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethods: Repository<PaymentMethod>,
  ) {}

  // --- Saved addresses -------------------------------------------------

  async listAddresses(userId: string): Promise<SavedAddress[]> {
    const profile = await this.profileFor(userId);
    return this.addresses.find({
      where: { customerProfileId: profile.id },
      order: { createdAt: 'DESC' },
    });
  }

  async createAddress(userId: string, dto: CreateSavedAddressDto): Promise<SavedAddress> {
    const profile = await this.profileFor(userId);
    const count = await this.addresses.countBy({
      customerProfileId: profile.id,
    });
    const makeDefault = dto.isDefault === true || count === 0;
    const address = this.addresses.create({
      customerProfileId: profile.id,
      label: dto.label,
      addressText: dto.addressText,
      lat: dto.lat ?? null,
      lon: dto.lon ?? null,
      isDefault: makeDefault,
    });
    if (makeDefault) {
      await this.addresses.update(
        { customerProfileId: profile.id, isDefault: true },
        { isDefault: false },
      );
    }
    return this.addresses.save(address);
  }

  async updateAddress(
    userId: string,
    id: string,
    dto: UpdateSavedAddressDto,
  ): Promise<SavedAddress> {
    const address = await this.addressFor(userId, id);
    if (dto.label !== undefined) address.label = dto.label;
    if (dto.addressText !== undefined) address.addressText = dto.addressText;
    if (dto.lat !== undefined) address.lat = dto.lat;
    if (dto.lon !== undefined) address.lon = dto.lon;
    if (dto.isDefault !== undefined) {
      if (dto.isDefault) await this.resetDefaults(address.customerProfileId);
      address.isDefault = dto.isDefault;
    }
    return this.addresses.save(address);
  }

  async removeAddress(userId: string, id: string): Promise<{ removed: boolean }> {
    const address = await this.addressFor(userId, id);
    await this.addresses.remove(address);
    return { removed: true };
  }

  async setDefaultAddress(userId: string, id: string): Promise<SavedAddress> {
    const address = await this.addressFor(userId, id);
    await this.resetDefaults(address.customerProfileId);
    address.isDefault = true;
    return this.addresses.save(address);
  }

  // --- Payment methods -------------------------------------------------

  async listPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    const profile = await this.profileFor(userId);
    return this.paymentMethods.find({
      where: { customerProfileId: profile.id },
      order: { createdAt: 'DESC' },
    });
  }

  async createPaymentMethod(
    userId: string,
    dto: CreatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const profile = await this.profileFor(userId);
    const count = await this.paymentMethods.countBy({
      customerProfileId: profile.id,
    });
    const isDefault = dto.isDefault === true || count === 0;
    const method = this.paymentMethods.create({
      customerProfileId: profile.id,
      type: dto.type,
      label: dto.label,
      detail: dto.detail,
      phoneNumber: dto.phoneNumber ?? null,
      isDefault,
    });
    if (isDefault) {
      await this.paymentMethods.update(
        { customerProfileId: profile.id, isDefault: true },
        { isDefault: false },
      );
    }
    return this.paymentMethods.save(method);
  }

  async updatePaymentMethod(
    userId: string,
    id: string,
    dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const method = await this.paymentMethodFor(userId, id);
    if (dto.label !== undefined) method.label = dto.label;
    if (dto.detail !== undefined) method.detail = dto.detail;
    if (dto.isDefault !== undefined) {
      if (dto.isDefault) await this.paymentMethods.update(
        { customerProfileId: method.customerProfileId, isDefault: true },
        { isDefault: false },
      );
      method.isDefault = dto.isDefault;
    }
    return this.paymentMethods.save(method);
  }

  async removePaymentMethod(userId: string, id: string): Promise<{ removed: boolean }> {
    const method = await this.paymentMethodFor(userId, id);
    await this.paymentMethods.remove(method);
    return { removed: true };
  }

  // --- Helpers ---------------------------------------------------------

  private async profileFor(userId: string): Promise<CustomerProfile> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Customer profile not found');
    }
    return profile;
  }

  private async addressFor(userId: string, id: string): Promise<SavedAddress> {
    const profile = await this.profileFor(userId);
    const address = await this.addresses.findOne({
      where: { id, customerProfileId: profile.id },
    });
    if (!address) {
      throw new NotFoundException('Saved address not found');
    }
    return address;
  }

  private async paymentMethodFor(userId: string, id: string): Promise<PaymentMethod> {
    const profile = await this.profileFor(userId);
    const method = await this.paymentMethods.findOne({
      where: { id, customerProfileId: profile.id },
    });
    if (!method) {
      throw new NotFoundException('Payment method not found');
    }
    return method;
  }

  private async resetDefaults(customerProfileId: string): Promise<void> {
    await this.addresses.update(
      { customerProfileId, isDefault: true },
      { isDefault: false },
    );
  }
}