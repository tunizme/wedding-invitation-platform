import type { Bank } from '../document/types';
import { createBankQrPayload } from '../document/qr-bank';
import bankCatalog from '../document/bank-catalog.json';
import { QrBankWidget } from './widgets/qr-bank';

export function GiftAccounts({
  accounts,
  locale,
}: {
  accounts: Bank[];
  locale: 'vi' | 'en';
}) {
  const valid = accounts.slice(0, 2).flatMap((bank) => {
    try {
      const payload = createBankQrPayload(bank);
      if (!bank.bin || !bank.account || !bank.recipientName) return [];
      return [
        {
          bank: {
            ...bank,
            bin: bank.bin,
            account: bank.account,
            recipientName: bank.recipientName,
          },
          payload,
        },
      ];
    } catch {
      return [];
    }
  });
  if (!valid.length)
    return (
      <p>
        {locale === 'vi'
          ? 'Chưa có thông tin tài khoản ngân hàng.'
          : 'No bank account information is available.'}
      </p>
    );
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 24,
        textAlign: 'center',
      }}
    >
      {valid.map(({ bank, payload }, index) => (
        <article key={bank.bin + bank.account + index}>
          <h3>
            {
              bankCatalog.banks.find((entry) => entry.bin === bank.bin)
                ?.shortName
            }
          </h3>
          <QrBankWidget
            bank={bank}
            payload={payload}
            label={`${locale === 'vi' ? 'Tài khoản' : 'Account'} ${index + 1}`}
          />
        </article>
      ))}
    </div>
  );
}
