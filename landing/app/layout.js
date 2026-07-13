import "./globals.css";

export const metadata = {
  title: "EverNav — Navigate the web, one glowing step at a time",
  description:
    "EverNav is a Chrome extension that walks you through complex web UIs. Type what you want to do, and EverNav glows the exact element to click. Sign up for early access.",
  metadataBase: new URL("https://evernav.vercel.app"),
  openGraph: {
    title: "EverNav — Navigate the web",
    description:
      "Type what you want to do. EverNav glows the exact element to click.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EverNav — Navigate the web",
    description:
      "Type what you want to do. EverNav glows the exact element to click.",
    creator: "@_BabTuna_",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
