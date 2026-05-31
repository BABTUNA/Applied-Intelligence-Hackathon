import "./globals.css";

export const metadata = {
  title: "EverNav — Dashboard",
  description: "Click-trail skills learned across users",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
