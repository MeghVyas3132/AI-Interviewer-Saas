import type { Metadata } from 'next';
import './globals.css';
import { ConditionalLayout } from '@/components/conditional-layout';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'Aigenthix AI Powered Coach',
  description: 'Your personal AI-powered exam and interview coach.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Space+Grotesk:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-[Montserrat] antialiased" suppressHydrationWarning>
        <ConditionalLayout>{children}</ConditionalLayout>
      </body>
    </html>
  );
}
