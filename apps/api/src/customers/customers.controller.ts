import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { CustomersService } from './customers.service';
import { CustomerProfile } from './customer-profile.entity';

const ACTING_ROLE_HEADER = 'x-nitume-acting-role';

@Controller('customers')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.CUSTOMER, UserRole.RUNNER, UserRole.ADMIN, UserRole.BUSINESS)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  /**
   * Returns the customer profile for the authenticated user. A `runner` role
   * user may pass X-Nitume-Acting-Role: customer to view/update their
   * customer-side profile (a user can hold both roles over time).
   */
  @Get('me')
  getMe(
    @CurrentUser() user: AuthContext,
    @Headers(ACTING_ROLE_HEADER) actingRole?: string,
  ): Promise<CustomerProfile> {
    this.requireCustomerRole(user, actingRole);
    return this.customers.getByUserId(user.userId);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthContext,
    @Headers(ACTING_ROLE_HEADER) actingRole: string | undefined,
    @Body() dto: UpdateCustomerProfileDto,
  ): Promise<CustomerProfile> {
    this.requireCustomerRole(user, actingRole);
    return this.customers.updateDefaults(user.userId, dto.defaultAddressText ?? null);
  }

  private requireCustomerRole(user: AuthContext, actingRole?: string): void {
    if (user.role !== UserRole.CUSTOMER && actingRole !== UserRole.CUSTOMER) {
      throw new UnauthorizedException(
        'This endpoint is for customer accounts. Use X-Nitume-Acting-Role: customer to act as one.',
      );
    }
  }
}