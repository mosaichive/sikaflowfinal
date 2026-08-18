// Block-based email composer model + email-safe HTML renderer.
// Blocks are serialized into body_html as an HTML comment so no schema change
// is needed; the send function ships the rendered HTML as-is.

export type EmailBlock =
  | { id: string; type: 'hero'; imageUrl: string; alt: string; link: string }
  | { id: string; type: 'badge'; text: string }
  | { id: string; type: 'heading'; text: string }
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'button'; label: string; url: string }
  | { id: string; type: 'feature'; imageUrl: string; title: string; text: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer' }
  | { id: string; type: 'section_start' }
  | { id: string; type: 'section_end' };

export const BLOCKS_MARKER = '<!--kt-blocks-->';
const DATA_PREFIX = '<!--kt-blocks-data:';

export const uid = () => Math.random().toString(36).slice(2, 10);

const esc = (s: string) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Keep merge tags usable inside escaped text.
const text = (s: string) => esc(s).replace(/\n/g, '<br />');

const FONT = 'Helvetica, Arial, sans-serif';
const BRAND = '#0f766e';

function cardOpen() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;margin:0 0 16px;overflow:hidden;"><tr><td style="padding:0 0 8px;">`;
}
function cardClose() {
  return `</td></tr></table>`;
}

function renderBlock(b: EmailBlock): string {
  switch (b.type) {
    case 'hero': {
      const img = `<img src="${esc(b.imageUrl)}" alt="${esc(b.alt)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />`;
      return `<tr><td style="padding:0;">${b.link ? `<a href="${esc(b.link)}">${img}</a>` : img}</td></tr>`;
    }
    case 'badge':
      return `<tr><td style="padding:20px 28px 0;font-family:${FONT};"><span style="display:inline-block;background:#fde68a;color:#78350f;font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px;">${text(b.text)}</span></td></tr>`;
    case 'heading':
      return `<tr><td style="padding:16px 28px 0;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:700;color:#111827;">${text(b.text)}</td></tr>`;
    case 'text':
      return `<tr><td style="padding:14px 28px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:#374151;">${text(b.text)}</td></tr>`;
    case 'button':
      return `<tr><td style="padding:22px 28px 6px;font-family:${FONT};"><a href="${esc(b.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:8px;">${text(b.label)}</a></td></tr>`;
    case 'feature':
      return `<tr><td style="padding:18px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="180" valign="top" style="padding-right:16px;">
            <img src="${esc(b.imageUrl)}" alt="" width="180" style="display:block;width:180px;max-width:180px;height:auto;border-radius:8px;border:0;" />
          </td>
          <td valign="top" style="font-family:${FONT};">
            <div style="font-size:17px;font-weight:700;color:#111827;margin:0 0 6px;">${text(b.title)}</div>
            <div style="font-size:14px;line-height:1.6;color:#4b5563;">${text(b.text)}</div>
          </td>
        </tr></table>
      </td></tr>`;
    case 'divider':
      return `<tr><td style="padding:20px 28px 0;"><div style="border-top:1px solid #e5e7eb;"></div></td></tr>`;
    case 'spacer':
      return `<tr><td style="height:20px;line-height:20px;font-size:0;">&nbsp;</td></tr>`;
    default:
      return '';
  }
}

/** Render blocks to email-safe HTML (stacked white cards on a light background). */
export function renderBlocks(blocks: EmailBlock[]): string {
  let html = BLOCKS_MARKER;
  let open = false;
  const openCard = () => {
    if (!open) {
      html += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;margin:0 0 16px;">`;
      open = true;
    }
  };
  const closeCard = () => {
    if (open) {
      html += `<tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr></table>`;
      open = false;
    }
  };

  for (const b of blocks) {
    if (b.type === 'section_start') { closeCard(); openCard(); continue; }
    if (b.type === 'section_end') { closeCard(); continue; }
    openCard();
    html += renderBlock(b);
  }
  closeCard();
  return html;
}

/** Store the block model alongside the rendered HTML so it can be reopened. */
export function serializeBlocks(blocks: EmailBlock[]): string {
  const data = encodeURIComponent(JSON.stringify(blocks));
  return `${renderBlocks(blocks)}\n${DATA_PREFIX}${data}-->`;
}

export function parseBlocks(bodyHtml: string): EmailBlock[] | null {
  const m = (bodyHtml ?? '').match(/<!--kt-blocks-data:([\s\S]*?)-->/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(m[1]));
    return Array.isArray(parsed) ? (parsed as EmailBlock[]) : null;
  } catch {
    return null;
  }
}

export function starterBlocks(): EmailBlock[] {
  return [
    { id: uid(), type: 'section_start' },
    { id: uid(), type: 'badge', text: 'New' },
    { id: uid(), type: 'heading', text: 'A headline that gets noticed' },
    { id: uid(), type: 'text', text: 'Hi {{first_name}}, write the main message here. Keep it short and clear.' },
    { id: uid(), type: 'button', label: 'Open KudiTrack', url: 'https://kuditrack.online' },
    { id: uid(), type: 'section_end' },
    { id: uid(), type: 'section_start' },
    { id: uid(), type: 'heading', text: 'What you get' },
    { id: uid(), type: 'text', text: 'Two short highlights, each with an image.' },
    { id: uid(), type: 'button', label: 'Learn more', url: 'https://kuditrack.online' },
    { id: uid(), type: 'section_end' },
  ];
}
