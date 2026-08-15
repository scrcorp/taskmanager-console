/**
 * /manifest.json — PWA 매니페스트.
 *
 * 정적 파일(public/manifest.json)이었으나 환경별 아이콘/이름을 주려고 라우트로 바꿨다.
 * URL 은 그대로 `/manifest.json` 이라 이미 설치된 홈 화면 앱에 영향 없다.
 *
 * scope/start_url 이 `/c` 라 설치하면 간소화 콘솔이 뜬다 (서비스워커 없음).
 * 환경 구분은 이름 접미사(HTM-DEV/HTM-STG)와 아이콘 배경색 두 축으로 준다 —
 * 한 폰에 여러 환경을 설치했을 때 어느 게 어느 환경인지 구분되어야 한다.
 */

const env = process.env.NEXT_PUBLIC_APP_ENV;

const BRAND = env === 'production'
  ? { dir: 'prod', name: 'HTM Compact', short: 'HTM' }
  : env === 'staging'
    ? { dir: 'stg', name: 'HTM Compact [STG]', short: 'HTM-STG' }
    : { dir: 'dev', name: 'HTM Compact [DEV]', short: 'HTM-DEV' };

export function GET() {
  const b = `/brand/${BRAND.dir}`;
  return Response.json({
    name: BRAND.name,
    short_name: BRAND.short,
    description: 'Compact console for schedules and attendance',
    start_url: '/c',
    scope: '/c',
    display: 'standalone',
    background_color: '#0F1117',
    theme_color: '#0F1117',
    icons: [
      { src: `${b}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${b}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${b}/icon-maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: `${b}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, { headers: { 'Content-Type': 'application/manifest+json' } });
}
