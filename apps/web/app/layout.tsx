import type { Metadata } from "next";
import { Commissioner, EB_Garamond } from "next/font/google";
import "./globals.css";

const commissioner = Commissioner({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap"
});

const garamond = EB_Garamond({
  subsets: ["latin", "cyrillic"],
  variable: "--font-serif",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Иерархия работ OOD",
  description: "MVP-приложение для управления иерархическим списком работ."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={`${commissioner.variable} ${garamond.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/remixicon@4.3.0/fonts/remixicon.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
