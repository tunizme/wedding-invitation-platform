import * as bankCatalog from './bank-catalog.json';
import type { Bank } from './document.types';

const BINS = new Set(bankCatalog.banks.map((bank) => bank.bin));
const tlv = (tag: string, value: string) => {
  if (value.length > 99) throw new Error('QR_FIELD_TOO_LONG');
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
};
function crc16(input: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(input)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function createBankQrPayload(
  bank: Pick<Bank, 'bin' | 'account' | 'recipientName' | 'message'>,
): string {
  const { bin, account, recipientName, message = '' } = bank;
  if (
    !bin ||
    !BINS.has(bin) ||
    !account ||
    !/^\d{6,19}$/.test(account) ||
    !recipientName ||
    [...recipientName].length < 5 ||
    [...recipientName].length > 50 ||
    !/^[A-Za-z0-9 ]{0,25}$/.test(message)
  )
    throw new Error('QR_BANK_DATA_INVALID');
  const accountFields =
    tlv('00', bin) + tlv('01', account) + tlv('02', 'QRIBFTTA');
  // VietQR's reviewed consumer-account profile counts the data bytes in this
  // nested value. The containing merchant account counts the full encoded TLV.
  const consumerAccount = `01${String(bin.length + account.length + 8).padStart(2, '0')}${accountFields}`;
  const merchant = tlv('00', 'A000000727') + consumerAccount;
  const merchantAccount = tlv('38', merchant);
  const additional = message ? tlv('62', tlv('08', message)) : '';
  const body =
    tlv('00', '01') +
    tlv('01', '11') +
    merchantAccount +
    tlv('53', '704') +
    tlv('58', 'VN') +
    additional +
    '6304';
  return body + crc16(body);
}

export function verifyBankQrPayload(payload: string): boolean {
  if (!/^.*6304[0-9A-F]{4}$/.test(payload)) return false;
  const prefix = payload.slice(0, -4);
  return crc16(prefix) === payload.slice(-4);
}
