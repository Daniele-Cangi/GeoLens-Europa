import { ImageResponse } from 'next/og';

export const alt = 'GeoLens — Environmental Evidence Infrastructure';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: '#f5f6f4',
          color: '#102a43',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 52,
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #185f9d',
              color: '#185f9d',
              fontSize: 15,
              letterSpacing: '0.08em',
            }}
          >
            GL
          </div>
          GeoLens
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              maxWidth: 980,
              flexDirection: 'column',
              fontFamily: 'Georgia, serif',
              fontSize: 78,
              fontWeight: 400,
              letterSpacing: '-0.045em',
              lineHeight: 1,
            }}
          >
            <span>Environmental evidence</span>
            <span style={{ color: '#185f9d' }}>infrastructure.</span>
          </div>
          <div
            style={{
              display: 'flex',
              maxWidth: 850,
              marginTop: 32,
              color: '#5e6d78',
              fontSize: 24,
              lineHeight: 1.4,
            }}
          >
            Real observations, terrain and infrastructure become traceable
            derived state—with uncertainty intact.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            color: '#5e6d78',
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex', width: 80, height: 2, background: '#185f9d' }} />
          Spatial evidence → traceable physical state
        </div>
      </div>
    ),
    size,
  );
}
