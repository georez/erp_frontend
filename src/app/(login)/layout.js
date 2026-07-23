import "@/app/globals.css";

export const metadata = {
  title: "Example App (Login)",
  description: "Example App Description (Login)",
};

export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
