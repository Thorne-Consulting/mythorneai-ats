import { ImageResponse } from 'next/og';
import { isHexColor, textOn } from '@/features/careers/brand';
import { idFromParam, metaParts } from '@/features/careers/jobs';
import { getJob, getOrganization } from '@/features/careers/server';

export const alt = 'Job opening';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The picture shown when a job link is shared in Slack, LinkedIn or a text message: the
// employer's colour and icon. Image rendering has no access to the theme's variables, so without
// a brand these mirror --chrome, --nav-foreground and --primary from styles.css.
const NAVY = '#071a36';
const MUTED = '#c1d3ee';
const ACCENT = '#2468ff';
const API = process.env.API_ORIGIN ?? 'http://localhost:5080';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = idFromParam((await params).id);
  const [job, organization] = await Promise.all([id ? getJob(id) : null, getOrganization()]);
  const company = organization.name?.trim() || 'Careers';
  const color = organization.brand?.brandColor;
  const background = isHexColor(color) ? color : NAVY;
  const ink = isHexColor(color) ? textOn(color) : '#ffffff';
  const muted = isHexColor(color) ? ink : MUTED;
  const icon = organization.brand?.iconUrl;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background,
        color: ink,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered to a picture, not the page
          <img
            src={`${API}${icon}`}
            width={72}
            height={72}
            alt=""
            style={{ borderRadius: 16, objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: isHexColor(color) ? ink : ACCENT,
              color: isHexColor(color) ? background : 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            {company.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ fontSize: 36, color: muted, opacity: isHexColor(color) ? 0.85 : 1 }}>
          {`${company} is hiring`}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div
          style={{
            fontSize: job && job.title.length > 40 ? 64 : 80,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {job?.title ?? 'Open jobs'}
        </div>
        {job && (
          <div style={{ fontSize: 34, color: muted, opacity: isHexColor(color) ? 0.85 : 1 }}>
            {metaParts(job).join('  ·  ')}
          </div>
        )}
      </div>
    </div>,
    size,
  );
}
