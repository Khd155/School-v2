import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "استعلام التحصيل الدراسي",
  description: "استعلام أولياء الأمور عن التحصيل الدراسي في مادة الدراسات الإسلامية.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#11304f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <a href="#main" className="skip-link">
          انتقل إلى المحتوى
        </a>
        {children}
      </body>
    </html>
  );
}
