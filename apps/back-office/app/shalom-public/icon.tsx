import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function ShalomPublicIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0d9488',
          borderRadius: 8,
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="24" height="24" fill="none">
          <path
            d="M8 22V12.5L16 8l8 4.5V22H8Z"
            stroke="#fffdf9"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path
            d="M13 22v-5.5h6V22"
            stroke="#ccfbf1"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
