// Payer number helpers (#8; port of the app's `maskPhone`, util/display.dart).
import { normalizeKenyanPhone } from '../../../shared/format/formatters';

/** `+254 712 ••• 678`: the masked form of a Kenyan mobile; anything else unchanged. */
export function maskPhone(phone: string): string {
  const n = normalizeKenyanPhone(phone);
  return n ? `+254 ${n.substring(4, 7)} ••• ${n.substring(10)}` : phone;
}
