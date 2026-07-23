import "@/app/globals.css";

export const metadata = {
  title: "Example App",
  description: "Example App Description",
};

export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
