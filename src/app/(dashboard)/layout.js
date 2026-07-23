import "@/app/globals.css";

export const metadata = {
  title: "Example App (Dashboard)",
  description: "Example App Description (Dashboard)",
};

export default async function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
