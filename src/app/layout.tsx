import type { Metadata } from 'next';
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from 'next/font/google';
import './globals.css';

const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', display: 'swap' });
const schibsted = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-schibsted', display: 'swap' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Nexo Assist · Service desk de TI',
  description: 'Seu problema de TI, resolvido em uma conversa.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${newsreader.variable} ${schibsted.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
