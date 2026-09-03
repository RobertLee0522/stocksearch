import type { Metadata } from 'next';
import { Noto_Sans_TC } from 'next/font/google';
import './globals.css';

const notoSansTC = Noto_Sans_TC({ variable: '--font-noto-tc', subsets: ['latin'] });

export const metadata: Metadata = {
  title: '籌碼雷達｜台股籌碼與價格工作台',
  description: '以清楚資料狀態呈現個股價格、法人買賣超與大戶／散戶籌碼觀察。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body className={`${notoSansTC.variable} antialiased`}>{children}</body></html>;
}
