import { redirect } from 'next/navigation'
import { legacyStudioHref } from '../../lib/legacyExplorerLink.js'

// Compatibility only: the legacy interface and scoring controls are removed.
export default async function ExplorePage({ searchParams }) {
  redirect(legacyStudioHref(await searchParams))
}
