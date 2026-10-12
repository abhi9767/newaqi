import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CarbonCanopy: carbon estimate and afforestation siting',
  description: 'Estimate city carbon emissions, the afforestation needed to offset them, and where to plant using air quality, wind and land-use data.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
