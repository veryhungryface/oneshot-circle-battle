import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '원샷 서클 배틀',
  description: 'QR로 참여하는 교실 원 그리기 정확도 대결'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
