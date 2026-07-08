import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GrowEasy CSV Importer",
  description: "AI-mapped CSV to CRM lead importer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-mist text-ink dark:bg-ink dark:text-mist font-display transition-colors">
        {children}
      </body>
    </html>
  );
}
