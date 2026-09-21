import { ChatMessage } from '../chat/chat-message.entity';
import { OtpCode } from '../auth/otp-code.entity';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { PaymentMethod } from '../customers/payment-method.entity';
import { SavedAddress } from '../customers/saved-address.entity';
import { DisputeEvent } from '../disputes/dispute-event.entity';
import { Dispute } from '../disputes/dispute.entity';
import { ErrandAssignment } from '../errands/errand-assignment.entity';
import { ErrandItem } from '../errands/errand-item.entity';
import { ErrandLocation } from '../errands/errand-location.entity';
import { ErrandStatusHistory } from '../errands/errand-status-history.entity';
import { Errand } from '../errands/errand.entity';
import { Quote } from '../errands/quote.entity';
import { PriceChangeRequest } from '../matching/price-change-request.entity';
import { Evidence } from '../evidence/evidence.entity';
import { AppNotification } from '../notifications/app-notification.entity';
import { NotificationLog } from '../notifications/notification-log.entity';
import { PaymentTransaction } from '../payments/payment-transaction.entity';
import { PaymentType } from '../payments/payment-type.entity';
import { Payment } from '../payments/payment.entity';
import { Rating } from '../ratings/rating.entity';
import { RunnerLocation } from '../runners/runner-location.entity';
import { RunnerProfile } from '../runners/runner-profile.entity';
import { RunnerServiceArea, RunnerSkillEntity } from '../runners/runner-skill.entity';
import { RunnerTrustScore } from '../runners/runner-trust-score.entity';
import { RunnerVerification } from '../runners/runner-verification.entity';
import { Device } from '../users/device.entity';
import { User } from '../users/user.entity';

export const ENTITY_LIST = [
  User,
  Device,
  CustomerProfile,
  SavedAddress,
  PaymentMethod,
  RunnerProfile,
  RunnerVerification,
  RunnerSkillEntity,
  RunnerServiceArea,
  RunnerLocation,
  RunnerTrustScore,
  Errand,
  ErrandLocation,
  ErrandItem,
  ErrandStatusHistory,
  ErrandAssignment,
  Quote,
  PriceChangeRequest,
  Payment,
  PaymentType,
  PaymentTransaction,
  Evidence,
  Dispute,
  DisputeEvent,
  Rating,
  ChatMessage,
  NotificationLog,
  AppNotification,
  OtpCode,
];