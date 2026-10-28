import "./globals.css"
import "./planner.css"

const siteUrl = 'https://playhouse-pittsburgh.vercel.app'
const description = 'Explore Pittsburgh housing and infrastructure scenarios in 3D. Compare housing options, adjust priorities, and inspect the public data and assumptions behind each result.'

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: "Playhouse · Pittsburgh Planning Studio",
  description,
  openGraph: { type: 'website', locale: 'en_US', url: siteUrl, siteName: 'Playhouse', title: 'Playhouse · Pittsburgh Planning Studio', description },
  twitter: { card: 'summary_large_image', title: 'Playhouse · Pittsburgh Planning Studio', description },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
