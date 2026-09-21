/** Minimal typed response shapes for the public Nitume website. Mirrored from
 *  the committed `apps/api` surface — never invent fields the API lacks. */

export interface OtpRequestResult {
  message: string;
}

export interface UserMe {
  id: string;
  phone: string;
  email?: string | null;
  role: 'customer' | 'runner' | 'admin' | 'business';
  status: 'active' | 'suspended' | 'banned';
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface OtpVerifyResult {
  user: UserMe;
  tokens: TokenPair;
}

export interface RegisterResult {
  user: UserMe;
}