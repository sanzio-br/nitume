import { ConfigService } from '@nestjs/config';
import { AfricasTalkingOtpSender } from './africas-talking-otp-sender';
import { ConsoleOtpSender } from './console-otp-sender';
import { OtpSender } from './otp-sender.interface';

export const OTP_SENDER = 'OTP_SENDER';

export const otpSenderProvider = {
  provide: OTP_SENDER,
  inject: [ConfigService, AfricasTalkingOtpSender, ConsoleOtpSender],
  useFactory: (
    config: ConfigService,
    atSender: AfricasTalkingOtpSender,
    consoleSender: ConsoleOtpSender,
  ): OtpSender => {
    const transport = config.get<'console' | 'africas_talking'>(
      'otp.senderTransport',
      'console',
    );
    return transport === 'africas_talking' ? atSender : consoleSender;
  },
};