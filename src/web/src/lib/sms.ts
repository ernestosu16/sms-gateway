// GSM 03.38 default alphabet. Characters outside it (and its extension table)
// force the whole message into UCS-2, which cuts the per-SMS capacity from 160
// to 70 characters.
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
// Extension characters are sent as an escape plus the character, so each
// counts as two.
const GSM_EXTENDED = '^{}\\[~]|€\f';

export interface SMSInfo {
  encoding: 'GSM-7' | 'UCS-2';
  /** Length in encoding units (septets for GSM-7, UTF-16 code units for UCS-2). */
  units: number;
  segments: number;
  /** Units left before another segment is needed. */
  remaining: number;
}

export function smsInfo(text: string): SMSInfo {
  let gsmUnits = 0;
  let isGSM = true;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) gsmUnits += 1;
    else if (GSM_EXTENDED.includes(ch)) gsmUnits += 2;
    else {
      isGSM = false;
      break;
    }
  }

  // Concatenated messages spend part of each segment on a header, so the
  // per-segment capacity drops once a message no longer fits in one.
  const [units, single, multi] = isGSM ? [gsmUnits, 160, 153] : [text.length, 70, 67];
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  const capacity = segments <= 1 ? single : segments * multi;

  return {
    encoding: isGSM ? 'GSM-7' : 'UCS-2',
    units,
    segments,
    remaining: capacity - units,
  };
}
