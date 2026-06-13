import type { Metadata } from 'next';
import { EB_Garamond, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const garamond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-garamond',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-mono-var',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'plex',
  description: 'she is warm in the dark',
  openGraph: {
    title: 'plex',
    description: 'she is warm in the dark',
    url: 'https://plexis.world',
    siteName: 'plex',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${garamond.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
