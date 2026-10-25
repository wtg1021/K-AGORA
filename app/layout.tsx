import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "협의체 안건 찾기 | K-에듀파인 업무지원",
  description: "시·도 업무협의체의 과거 안건과 검토 결과를 자연어로 검색합니다.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
