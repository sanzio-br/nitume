import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { DevicePlatform } from '../../common/enums';

export class RegisterDeviceDto {
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  /** FCM registration token issued to this app install. */
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  pushToken: string;
}
