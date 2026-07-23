import "@/app/globals.css";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Example App (Dashboard)",
  description: "Example App Description (Dashboard)",
};

// async function verifyJwt(jwtValue) {
//   if (!jwtValue) {
//     // Get the current path from request headers
//     const headerList = await headers();
//     const currentPath = headerList.get("x-url") || "/dashboard";

//     // Encode to safely pass special characters in query string
//     const encodedCallback = encodeURIComponent(currentPath);
    
//     redirect(`/login?callbackUrl=${encodedCallback}`);
//   }

//   // Here you can add additional verification logic if needed
//   // For example, you could decode the JWT and check its expiration or signature
// }

export default async function RootLayout({ children }) {
  // const cookieStore = await cookies();
  // const jwtValue = cookieStore.get("jwt")?.value;
  // await verifyJwt(jwtValue);

  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
