import {
  ExternalHyperlink,
  ImageRun,
  FootnoteReferenceRun,
  HeadingLevel,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import {
  normalizeUiSpecRows,
  UI_SPEC_COLUMNS,
} from '../ui-spec/ui-spec-utils';
import { Node } from 'prosemirror-model';
import { MindMapTopic, normalizeMindMap } from '../mind-map/mind-map-utils';
import { imageDimensionsFromData } from 'image-dimensions';
import { sanitizeIntegrationUrl } from '../integration-link/integration-link';
import {
  DocxSerializerAsync,
  MarkSerializer,
  NodeSerializerAsync,
  OptionsAsync,
} from './serializer';
import { CELL_MARGIN, TEXT_WIDTH, writeDocx } from './utils';

// UI spec block -> Word table in the same layout as the source spec documents:
// ID | Items | Description | Displayed Content / Context | Specification
const UI_SPEC_COL_RATIOS = [0.08, 0.14, 0.24, 0.2, 0.34];
const UI_SPEC_HEADER_FILL = '1F3864';

// Indent (0-8 steps of 2em, about 0.33in each) and line spacing (multiple of
// single, docx counts 240 per line) from the paragraph/heading attributes.
function blockFormat(node: Node): Record<string, any> {
  const out: Record<string, any> = {};
  const indent = Number(node.attrs?.indent) || 0;
  if (indent > 0) out.indent = { left: indent * 480 };
  const lh = parseFloat(String(node.attrs?.lineHeight ?? ''));
  if (lh > 0) out.spacing = { line: Math.round(lh * 240) };
  return out;
}

// Mind map -> bold central topic and an indented outline of its topics.
const renderMindMap: NodeSerializerAsync[string] = (state, node) => {
  const map = normalizeMindMap(node.attrs?.data);
  state.children.push(
    new Paragraph({ children: [new TextRun({ text: map.text, bold: true })] }),
  );
  const walk = (topics: MindMapTopic[], level: number) => {
    for (const t of topics) {
      state.children.push(
        new Paragraph({
          indent: { left: 360 * (level + 1), hanging: 240 },
          children: [new TextRun(`• ${t.text}`)],
        }),
      );
      walk(t.children, level + 1);
    }
  };
  walk(map.children, 0);
  state.children.push(new Paragraph(''));
};

const renderUiSpec: NodeSerializerAsync[string] = async (state, node) => {
  const rows = normalizeUiSpecRows(node.attrs?.rows);
  const widths = UI_SPEC_COL_RATIOS.map((r) => Math.floor(TEXT_WIDTH * r));
  // Table-wide font: "16px" -> 24 half-points; first family in the CSS list.
  // Cell and field fonts override the table font.
  type Font = { fontFamily?: string; fontSize?: string };
  const sizeOf = (f?: Font) => {
    const px = parseFloat(String(f?.fontSize ?? ''));
    return px > 0 ? Math.round(px * 1.5) : undefined;
  };
  const familyOf = (f?: Font) =>
    String(f?.fontFamily ?? '')
      .split(',')[0]
      .replace(/['"]/g, '')
      .trim() || undefined;
  const tableFont = node.attrs as Font;
  const run = (
    opts: { text: string; bold?: boolean; color?: string },
    cellFont?: Font,
  ) =>
    new TextRun({
      ...opts,
      size: sizeOf(cellFont) ?? sizeOf(tableFont),
      font: familyOf(cellFont) ?? familyOf(tableFont),
    });
  const lines = (text: string, cellFont?: Font) =>
    (text || '')
      .split('\n')
      .map((t) => new Paragraph({ children: [run({ text: t }, cellFont)] }));
  // Pictures in the Displayed Content column, scaled to the column width.
  const images = async (srcs: string[], maxWidthPx: number) => {
    const out: Paragraph[] = [];
    for (const src of srcs) {
      try {
        const data = await Promise.resolve(
          (state as any).options.getImageBuffer(src),
        );
        const dim = imageDimensionsFromData(data);
        if (!dim) continue;
        const width = Math.min(maxWidthPx, dim.width);
        const ext = src.split('?')[0].replace(/.*\./, '').toLowerCase();
        out.push(
          new Paragraph({
            children: [
              new ImageRun({
                data,
                type: (['png', 'jpg', 'gif', 'bmp'].includes(ext)
                  ? ext
                  : ext === 'jpeg'
                    ? 'jpg'
                    : 'png') as any,
                transformation: {
                  width,
                  height: Math.round((width * dim.height) / dim.width),
                },
              }),
            ],
          }),
        );
      } catch {
        // Missing or external image: leave it out of the export.
      }
    }
    return out;
  };
  const cell = (children: Paragraph[], i: number, header = false) =>
    new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: header
        ? { type: ShadingType.CLEAR, color: 'auto', fill: UI_SPEC_HEADER_FILL }
        : undefined,
      children: children.length ? children : [new Paragraph('')],
    });
  // DXA (1/1440 in) -> px at 96 dpi, minus the cell margins.
  const contentWidthPx = Math.max(
    40,
    Math.floor(((widths[3] - 2 * CELL_MARGIN) / 1440) * 96),
  );

  const headerRow = new TableRow({
    tableHeader: true,
    children: UI_SPEC_COLUMNS.map((c, i) =>
      cell(
        [new Paragraph({ children: [run({ text: c, bold: true, color: 'FFFFFF' })] })],
        i,
        true,
      ),
    ),
  });

  const bodyRows: TableRow[] = [];
  for (const r of rows) {
    bodyRows.push(
      new TableRow({
        children: [
          cell(lines(r.id, r.styles?.id), 0),
          cell(lines(r.item, r.styles?.item), 1),
          cell(lines(r.description, r.styles?.description), 2),
          cell(
            [
              ...(r.content ? lines(r.content, r.styles?.content) : []),
              ...(await images(r.images, contentWidthPx)),
            ],
            3,
          ),
          cell(
            r.specs.map(
              (s) =>
                new Paragraph({
                  children: s.key
                    ? [
                        run({ text: `- ${s.key}: `, bold: true }, s.style),
                        run({ text: s.value }, s.style),
                      ]
                    : [run({ text: `- ${s.value}` }, s.style)],
                }),
            ),
            4,
          ),
        ],
      }),
    );
  }

  if (node.attrs?.title) {
    state.children.push(
      new Paragraph({ children: [run({ text: node.attrs.title, bold: true })] }),
    );
  }
  state.children.push(
    new Table({
      width: { size: TEXT_WIDTH, type: WidthType.DXA },
      columnWidths: widths,
      margins: { left: CELL_MARGIN, right: CELL_MARGIN },
      rows: [headerRow, ...bodyRows],
    }),
  );
  state.children.push(new Paragraph(''));
};


export type DocxImageResolver = OptionsAsync['getImageBuffer'];

// docx requires a 6-digit hex color (no leading #). Convert #rgb, #rrggbb,
// and rgb()/rgba() inputs to 6-digit hex; return undefined for anything else
// (named colors, hsl, etc.) so the caller omits the color rather than letting
// docx throw "Invalid hex value".
function toDocxColor(input?: string): string | undefined {
  if (!input) return undefined;
  const value = input.trim().toLowerCase();
  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (/^[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const channel = (n: string) =>
      Math.max(0, Math.min(255, parseInt(n, 10)))
        .toString(16)
        .padStart(2, '0');
    return channel(rgb[1]) + channel(rgb[2]) + channel(rgb[3]);
  }
  return undefined;
}

// Images and diagrams embed via the image resolver; the URL (with its file
// extension) is passed through so docx can infer the image type.
const renderImage: NodeSerializerAsync[string] = async (state, node) => {
  const src = node.attrs?.src || node.attrs?.attachmentId;
  if (src) {
    try {
      await state.image(src, 100);
    } catch {
      // Unrenderable/missing image: skip rather than fail the whole export.
    }
  }
  state.closeBlock(node);
};

// Non-embeddable media render as a labelled line.
const renderFileLine: NodeSerializerAsync[string] = (state, node) => {
  const label =
    node.attrs?.name || node.attrs?.src || node.attrs?.url || 'attachment';
  state.text(label);
  state.closeBlock(node);
};

const renderEmbedLine: NodeSerializerAsync[string] = (state, node) => {
  const label = node.attrs?.src || node.attrs?.url || 'embed';
  state.text(label);
  state.closeBlock(node);
};

const renderIntegrationMention: NodeSerializerAsync[string] = (state, node) => {
  const url = sanitizeIntegrationUrl(node.attrs?.url);
  if (!url) return;
  state.current.push(
    new ExternalHyperlink({
      link: url,
      children: [new TextRun({ text: url, style: 'Hyperlink' })],
    }),
  );
};

const renderIntegrationCard: NodeSerializerAsync[string] = async (
  state,
  node,
  parent,
  index,
) => {
  await renderIntegrationMention(state, node, parent, index);
  state.closeBlock(node);
};

export const defaultAsyncNodes: NodeSerializerAsync = {
  text(state, node) {
    state.text(node.text ?? '');
  },
  async paragraph(state, node) {
    await state.renderInline(node);
    state.closeBlock(node, blockFormat(node));
  },
  async heading(state, node) {
    await state.renderInline(node);
    const heading = [
      HeadingLevel.HEADING_1,
      HeadingLevel.HEADING_2,
      HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,
      HeadingLevel.HEADING_5,
      HeadingLevel.HEADING_6,
    ][(node.attrs.level ?? 1) - 1];
    state.closeBlock(node, { heading, ...blockFormat(node) });
  },
  async blockquote(state, node) {
    await state.renderContent(node, { style: 'IntenseQuote' });
  },
  async codeBlock(state, node) {
    await state.renderContent(node);
    state.closeBlock(node);
  },
  horizontalRule(state, node) {
    state.closeBlock(node, { thematicBreak: true });
    state.closeBlock(node);
  },
  hardBreak(state) {
    state.addRunOptions({ break: 1 });
  },
  async bulletList(state, node) {
    await state.renderList(node, 'bullets');
  },
  async orderedList(state, node) {
    await state.renderList(node, 'numbered');
  },
  async listItem(state, node) {
    await state.renderListItem(node);
  },
  async taskList(state, node) {
    await state.renderList(node, 'bullets');
  },
  async taskItem(state, node) {
    if (state.currentNumbering) {
      state.addParagraphOptions({ numbering: state.currentNumbering });
    }
    state.text(node.attrs?.checked ? '☑ ' : '☐ ');
    await state.renderContent(node);
  },
  async table(state, node) {
    await state.table(node);
  },
  uiSpec: renderUiSpec,
  mindMap: renderMindMap,
  // Docmost stores LaTeX in attrs.text.
  mathInline(state, node) {
    state.math(node.attrs?.text ?? '', { inline: true });
  },
  mathBlock(state, node) {
    state.math(node.attrs?.text ?? '', { inline: false, numbered: false });
    state.closeBlock(node);
  },
  image: renderImage,
  drawio: renderImage,
  excalidraw: renderImage,
  video: renderFileLine,
  audio: renderFileLine,
  pdf: renderFileLine,
  attachment: renderFileLine,
  embed: renderEmbedLine,
  youtube: renderEmbedLine,
  integrationCard: renderIntegrationCard,
  integrationMention: renderIntegrationMention,
  async callout(state, node) {
    await state.renderContent(node, { style: 'IntenseQuote' });
  },
  async details(state, node) {
    await state.renderContent(node);
  },
  async detailsSummary(state, node) {
    await state.renderInline(node);
    state.closeBlock(node, { heading: HeadingLevel.HEADING_4 });
  },
  async detailsContent(state, node) {
    await state.renderContent(node);
  },
  async tabs(state, node) {
    await state.renderContent(node);
  },
  async tab(state, node) {
    await state.renderContent(node);
  },
  async tabLabel(state, node) {
    await state.renderInline(node);
    state.closeBlock(node, { heading: HeadingLevel.HEADING_4 });
  },
  async tabPanel(state, node) {
    await state.renderContent(node);
  },
  async columns(state, node) {
    await state.renderContent(node);
  },
  async column(state, node) {
    await state.renderContent(node);
  },
  async transclusionSource(state, node) {
    await state.renderContent(node);
  },
  mention(state, node) {
    state.text(`@${node.attrs?.label ?? ''}`);
  },
  status(state, node) {
    state.text(`[${node.attrs?.text ?? ''}]`);
  },
  pageBreak(state, node) {
    state.closeBlock(node, { pageBreakBefore: true });
  },
  footnoteReference(state, node) {
    const number =
      Number(node.attrs?.referenceNumber) || state.$footnoteCounter + 1;
    state.$footnoteCounter = Math.max(state.$footnoteCounter, number);
    // seed an empty body so the reference stays valid even if the trailing
    // footnotes list is missing; the footnotes node overwrites it with content
    if (!state.footnotes[number]) {
      state.footnotes[number] = { children: [new Paragraph('')] };
    }
    state.current.push(new FootnoteReferenceRun(number));
  },
  async footnotes(state, node) {
    for (let i = 0; i < node.childCount; i += 1) {
      const item = node.child(i);
      const number =
        Number(String(item.attrs?.id ?? '').replace('fn:', '')) || i + 1;
      await state.footnoteDefinition(item, number);
    }
  },
  // items are consumed by the footnotes handler above
  footnote() {},
  // No usable static export representation: skip without failing.
  subpages() {},
  transclusionReference() {},
  base() {},
};

export const defaultMarks: MarkSerializer = {
  bold() {
    return { bold: true };
  },
  italic() {
    return { italics: true };
  },
  strike() {
    return { strike: true };
  },
  underline() {
    return { underline: {} };
  },
  code() {
    return {
      font: { name: 'Monospace' },
      color: '000000',
      shading: { type: ShadingType.SOLID, color: 'D2D3D2', fill: 'D2D3D2' },
    };
  },
  superscript() {
    return { superScript: true };
  },
  subscript() {
    return { subScript: true };
  },
  link() {
    // Handled specifically in the serializer; Word treats links as nodes.
    return {};
  },
  highlight(_state, _node, mark) {
    const fill = toDocxColor(mark.attrs?.color);
    return fill
      ? { shading: { type: ShadingType.CLEAR, fill } }
      : { highlight: 'yellow' };
  },
  // @tiptap/extension-color stores the color on the textStyle mark.
  textStyle(_state, _node, mark) {
    const color = toDocxColor(mark.attrs?.color);
    const out: Record<string, unknown> = color ? { color } : {};
    // fontSize is stored as "16px"; docx sizes are half-points (px * 0.75 * 2).
    const px = parseFloat(String(mark.attrs?.fontSize ?? ''));
    if (px > 0) out.size = Math.round(px * 1.5);
    const family = String(mark.attrs?.fontFamily ?? '')
      .split(',')[0]
      .replace(/['"]/g, '')
      .trim();
    if (family) out.font = family;
    return out;
  },
  // Comments are editor-only; drop the annotation in the export.
  comment() {
    return {};
  },
};

export async function pageNodeToDocxBuffer(
  doc: Node,
  getImageBuffer: DocxImageResolver,
): Promise<Buffer> {
  const serializer = new DocxSerializerAsync(defaultAsyncNodes, defaultMarks);
  const wordDoc = await serializer.serializeAsync(
    doc,
    { getImageBuffer },
    // docx's built-in heading styles are blue (#2E74B5 / #1F4D78). The editor
    // has no heading color, so override the default heading run colors to the
    // normal text color. Sizes/italics mirror docx's own defaults so only the
    // color changes.
    () =>
      ({
        styles: {
          default: {
            document: { paragraph: { spacing: { after: 160 } } },
            heading1: {
              run: { color: '000000', size: 32 },
              paragraph: {
                keepNext: true,
                keepLines: true,
                spacing: { before: 240, after: 0 },
              },
            },
            heading2: {
              run: { color: '000000', size: 26 },
              paragraph: {
                keepNext: true,
                keepLines: true,
                spacing: { before: 40, after: 0 },
              },
            },
            heading3: {
              run: { color: '000000', size: 24 },
              paragraph: {
                keepNext: true,
                keepLines: true,
                spacing: { before: 40, after: 0 },
              },
            },
            heading4: {
              run: { color: '000000', italics: true },
              paragraph: {
                keepNext: true,
                keepLines: true,
                spacing: { before: 40, after: 0 },
              },
            },
            heading5: {
              run: { color: '000000' },
              paragraph: {
                keepNext: true,
                keepLines: true,
                spacing: { before: 40, after: 0 },
              },
            },
            heading6: {
              run: { color: '000000' },
              paragraph: {
                keepNext: true,
                keepLines: true,
                spacing: { before: 40, after: 0 },
              },
            },
          },
        },
      }) as any,
  );
  return writeDocx(wordDoc);
}
