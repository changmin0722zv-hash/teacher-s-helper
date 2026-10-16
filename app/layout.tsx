import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "수업의 결 · 나의 수업 계획",
  description: "단원에서 한 차시까지, 나만의 수업 계획 공간",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
