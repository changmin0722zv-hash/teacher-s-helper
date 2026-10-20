import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "100 900",
  style: "normal",
  display: "swap",
  fallback: ["Apple SD Gothic Neo", "Malgun Gothic", "Arial", "sans-serif"],
});

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
    <html lang="ko" className={pretendard.variable}>
      <body>{children}</body>
    </html>
  );
}
