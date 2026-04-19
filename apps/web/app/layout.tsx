import type { Metadata } from "next"
import { Commissioner, Gentium_Book_Plus } from "next/font/google"
import "./globals.css"

const commissioner = Commissioner({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
})

const gentiumBookPlus = Gentium_Book_Plus({
  weight: ["400", "700"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-serif",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Иерархия работ OOD",
  description: "MVP-приложение для управления иерархическим списком работ.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="ru"
      className={`${commissioner.variable} ${gentiumBookPlus.variable}`}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/remixicon@4.3.0/fonts/remixicon.css"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
