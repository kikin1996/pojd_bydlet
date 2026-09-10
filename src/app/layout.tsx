import type { Metadata } from "next";
import { Petrona, Karla } from "next/font/google";
import "./globals.css";

const petrona = Petrona({
  variable: "--font-petrona",
  subsets: ["latin", "latin-ext"],
});

const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Pojď bydlet",
  description: "Najdi svůj další domov a rezervuj si prohlídku bytu na dálku — s AI makléřem",
  other: {
    "theme-color": "#f6f7f4",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="cs"
      className={`${petrona.variable} ${karla.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
