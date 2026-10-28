export const metadata = {
  title: 'Accessibility & contact · Playhouse',
  description: 'Keyboard controls, accessible alternatives and ways to report a problem with Playhouse.',
}

export default function AccessibilityPage() {
  return <main className="accessibility-page">
    <a href="/">← Planning Studio</a>
    <h1>Accessibility & contact</h1>
    <p>Playhouse helps you test housing and infrastructure ideas for Pittsburgh. The results are preliminary comparisons, not approvals or predictions.</p>
    <h2>Using the controls</h2>
    <ul>
      <li>Use Tab and Shift+Tab to move through controls. The sidebar comes before the map in keyboard navigation.</li>
      <li>Use arrow keys in housing-type choices and dropdowns. Escape closes dialogs or cancels the current drawing.</li>
      <li>Ctrl+Z (Command+Z on Mac) undoes a plan change; add Shift to redo. Inside a text field, the browser keeps its normal text-editing shortcuts.</li>
      <li>Browser zoom enlarges the interface. Reduced-motion preferences turn off decorative building effects.</li>
      <li>Use Find sites, the building list, factor receipts and the site brief for information that does not depend on distinguishing map colors.</li>
    </ul>
    <h2>Current limitations</h2>
    <p>The 3D scene does not have a complete nonvisual equivalent. Drawing routes and moving footprints currently require a pointer. Numerical dimensions, site lists, comparisons and explanatory panels are available with the keyboard.</p>
    <h2>Report a problem</h2>
    <p><a href="https://github.com/tejaschaudhari131/hack-the-house/issues/new" target="_blank" rel="noreferrer">Open a GitHub issue</a> with the page, browser, assistive technology if relevant, and the steps that caused the problem. Include only information you are comfortable posting publicly.</p>
    <h2>Data and your scenario</h2>
    <p>Plans are saved in this browser. Exporting a scenario creates a file you can choose to share. Basemap tiles are requested from OpenFreeMap and use OpenStreetMap data; the tile service receives the usual network request information. Public-record sources and modeling assumptions are available in the app and the repository README.</p>
    <p><a href="/">Open Planning Studio</a></p>
  </main>
}
