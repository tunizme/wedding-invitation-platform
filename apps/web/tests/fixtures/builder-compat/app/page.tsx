'use client';
import dynamic from 'next/dynamic';
const Compatibility = dynamic(() => import('./probe'), { ssr: false });
export default function Page() {
  return <Compatibility />;
}
