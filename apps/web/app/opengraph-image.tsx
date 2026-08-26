import { ImageResponse } from 'next/og';

export const alt = 'GeoLens — Environmental evidence, made physical.';
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
          background: '#07130f',
          color: '#f2f3e9',
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
              border: '1px solid #b9f454',
              borderRadius: '50%',
              color: '#b9f454',
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
              fontSize: 82,
              fontWeight: 600,
              letterSpacing: '-0.06em',
              lineHeight: 0.94,
            }}
          >
            <span>Environmental evidence,</span>
            <span style={{ color: '#b9f454' }}>made physical.</span>
          </div>
          <div
            style={{
              display: 'flex',
              maxWidth: 850,
              marginTop: 32,
              color: '#a9b4aa',
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
            color: '#a9b4aa',
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex', width: 80, height: 2, background: '#b9f454' }} />
          Spatial evidence → traceable physical state
        </div>
      </div>
    ),
    size,
  );
}
