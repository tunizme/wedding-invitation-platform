import { createQrModules } from '../../document/qr-bank';
import type { Bank } from '../../document/types';
export function QrBankWidget({
  bank,
  payload,
  label,
}: {
  bank: Required<Pick<Bank, 'bin' | 'account' | 'recipientName'>> &
    Pick<Bank, 'message'>;
  payload: string;
  label: string;
}) {
  const { size, modules } = createQrModules(payload);
  const dark: React.ReactNode[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (modules[y * size + x])
        dark.push(
          <rect key={`${x}-${y}`} x={x + 4} y={y + 4} width="1" height="1" />,
        );
  return (
    <section aria-label={label}>
      <svg
        width={180}
        height={180}
        style={{ display: 'block', margin: '0 auto' }}
        role="img"
        aria-label={label + ' QR'}
        viewBox={`0 0 ${size + 8} ${size + 8}`}
        shapeRendering="crispEdges"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width={size + 8} height={size + 8} fill="#fff" />
        <g fill="#000">{dark}</g>
      </svg>
      <p style={{ margin: '4px 0' }}>{bank.recipientName}</p>
      <p style={{ margin: '4px 0' }}>{bank.account}</p>
      <p style={{ margin: '4px 0' }}>{bank.message}</p>
    </section>
  );
}
