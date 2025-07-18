import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header"; // Import the new Header component

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ASKql - Your Personal AI Data Analyst",
  description:
    "Convert natural language questions into SQL queries and get answers instantly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50`}>
        <Header /> {/* Add the Header component here */}
        <main className="py-8">{children}</main>
      </body>
    </html>
  );
}
