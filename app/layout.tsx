import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GitLite',
  description: 'Learn Git internals by using a local, in-browser Git implementation.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">{children}</body>
    </html>
  );
}
