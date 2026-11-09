import "./print.css";
import { Cairo } from 'next/font/google';

const cairo = Cairo({
  weight: ['400', '600', '700'],
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-cairo',
});

export const metadata = {
  title: "طباعة",
};

/** Printed documents (components/print): a plain page of their own, each in a browser tab, without the dashboard. */
export default function PrintLayout({ children }) {
  return (
    <html dir="rtl" lang="ar" className={cairo.variable}>
      <body>{children}</body>
    </html>
  );
}
