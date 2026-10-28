import { ImageResponse } from 'next/og'

export const alt = 'Playhouse — test housing and infrastructure ideas for Pittsburgh'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(<div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '70px', background: '#edf3e7', color: '#244b3b' }}>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 30, letterSpacing: 3 }}>PITTSBURGH PLANNING STUDIO</div>
      <div style={{ fontSize: 98, fontWeight: 700, marginTop: 18 }}>Playhouse</div>
      <div style={{ fontSize: 36, maxWidth: 920, marginTop: 12 }}>Test housing ideas. See the tradeoffs.</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
      {[90, 125, 110, 160, 210, 140, 185, 105].map((height, index) => <div key={index} style={{ display: 'flex', height, width: 110, background: ['#b88964', '#e1ac54', '#88a3b7', '#658978'][index % 4], borderTop: '8px solid #ffffff88' }}/>) }
    </div>
  </div>, size)
}
