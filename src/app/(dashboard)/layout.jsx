import "@/app/globals.css";
import { Cairo } from 'next/font/google';
import MuiProvider from "@/components/MuiProvider";
import AuthProvider from "@/components/AuthProvider";

const cairo = Cairo({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-cairo',
});

export const metadata = {
  title: "ERP (Dashboard)",
  description: "ERP Description (Dashboard)",
};

export default async function RootLayout({ children }) {
  return (
    <html dir="rtl" className={cairo.variable}>
      <body>
        <MuiProvider><AuthProvider>{children}</AuthProvider></MuiProvider>
      </body>
    </html>
  );
}
