export default function robots() {
  return { rules: { userAgent: '*', allow: '/', disallow: '/api/' }, host: 'https://playhouse-pittsburgh.vercel.app' }
}
