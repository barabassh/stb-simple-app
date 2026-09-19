import path from "node:path";

import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  exportColumnWidths,
  formatExportValue,
  isNumericFormat,
  totalsRow,
  type ExportDocument,
} from ".";

const FONT_FAMILY = "Inter";
const FONTS_DIR = path.join(process.cwd(), "src", "lib", "export", "fonts");

// The standard PDF fonts have no Cyrillic glyphs: Russian text would come out as empty boxes.
// Inter also has the arrow of the audit changes, which PT Sans, for one, lacks.
Font.register({
  family: FONT_FAMILY,
  fonts: [
    { src: path.join(FONTS_DIR, "Inter-Regular.ttf") },
    { src: path.join(FONTS_DIR, "Inter-Bold.ttf"), fontWeight: "bold" },
  ],
});

const LONG_WORD_LENGTH = 24;
const LONG_WORD_PART_LENGTH = 16;
const LONG_WORD_PART = new RegExp(`.{1,${LONG_WORD_PART_LENGTH}}`, "gu");

// The built-in hyphenation follows English rules, so words are kept whole. Only a token too long
// for a narrow column, such as a long login, is cut into parts the line may break between.
Font.registerHyphenationCallback((word) =>
  word.length > LONG_WORD_LENGTH ? (word.match(LONG_WORD_PART) ?? [word]) : [word],
);

const FONT_SIZE = 8;
const CELL_PADDING = 4;
// Digits and capitals of Inter, the widest common glyphs, take about 0.62 em; bold a little more.
const CHAR_WIDTH = FONT_SIZE * 0.65;

/** The longest word of a column in characters, as the line breaking above leaves it. */
function longestWord(texts: string[]): number {
  return Math.max(
    0,
    ...texts.flatMap((text) =>
      text
        .split(/\s+/)
        .map((word) => (word.length > LONG_WORD_LENGTH ? LONG_WORD_PART_LENGTH : word.length)),
    ),
  );
}

/**
 * Columns share the width of the page in proportion to their widths, which squeezes a short value
 * under a long header, such as a date, until it runs into the next cell. So no column is narrower
 * than its longest word.
 */
function minColumnWidths(content: ExportDocument): number[] {
  const totals = totalsRow(content);
  return content.columns.map((column) => {
    const values = [...content.rows, ...(totals ? [totals] : [])].map((row) =>
      formatExportValue(row[column.key], column.format),
    );
    return longestWord([column.header, ...values]) * CHAR_WIDTH + 2 * CELL_PADDING;
  });
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 40,
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    color: "#0f172a",
  },
  header: { marginBottom: 10 },
  title: { fontSize: 14, fontWeight: "bold", marginBottom: 2 },
  meta: { fontSize: 9, color: "#475569" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#cbd5e1" },
  headerRow: { backgroundColor: "#f1f5f9", borderTopWidth: 0.5 },
  cell: { flexBasis: 0, paddingVertical: 3, paddingHorizontal: CELL_PADDING },
  headerCell: { fontWeight: "bold" },
  totalsRow: { fontWeight: "bold", borderTopWidth: 0.5 },
  numeric: { textAlign: "right" },
  empty: { paddingVertical: 12, textAlign: "center", color: "#475569" },
  pageNumber: { position: "absolute", right: 28, bottom: 20, color: "#475569" },
});

function ReportDocument({ content }: { content: ExportDocument }) {
  const { title, columns, rows, labels } = content;
  const totals = totalsRow(content);
  const widths = exportColumnWidths(content);
  const minWidths = minColumnWidths(content);
  const cellStyles = columns.map((column, index) => [
    styles.cell,
    { flexGrow: widths[index], minWidth: minWidths[index] },
    ...(isNumericFormat(column.format) ? [styles.numeric] : []),
  ]);

  return (
    <Document title={title}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View fixed style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>
            {labels.generatedAt} · {labels.author}
          </Text>
        </View>
        {/* Fixed elements are repeated on every page, so each page starts with the column names. */}
        <View fixed style={[styles.row, styles.headerRow]}>
          {columns.map((column, index) => (
            <Text key={column.key} style={[...cellStyles[index], styles.headerCell]}>
              {column.header}
            </Text>
          ))}
        </View>
        {rows.length === 0 && <Text style={styles.empty}>{labels.empty}</Text>}
        {rows.map((row, rowIndex) => (
          // A row moves to the next page whole instead of being split between two.
          <View key={rowIndex} wrap={false} style={styles.row}>
            {columns.map((column, index) => (
              <Text key={column.key} style={cellStyles[index]}>
                {formatExportValue(row[column.key], column.format)}
              </Text>
            ))}
          </View>
        ))}
        {totals && (
          <View wrap={false} style={[styles.row, styles.totalsRow]}>
            {columns.map((column, index) => (
              <Text key={column.key} style={cellStyles[index]}>
                {formatExportValue(totals[column.key], column.format)}
              </Text>
            ))}
          </View>
        )}
        <Text
          fixed
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => labels.page(pageNumber, totalPages)}
        />
      </Page>
    </Document>
  );
}

/**
 * fontkit keeps the glyphs it has read in the loaded font. Embedding a composite glyph, such as
 * Cyrillic «С» drawn with the glyph of Latin «C», keeps that component without its character,
 * and the next document then loses the Latin letter from its text. So the fonts are loaded
 * afresh for every document; Font.reset() cannot do that, as it keeps the finished load.
 */
function reloadFonts() {
  for (const source of Font.getRegisteredFonts()[FONT_FAMILY].sources) {
    source.data = null;
    source.loadResultPromise = null;
  }
}

let lastRender: Promise<unknown> = Promise.resolve();

/** Documents are made one at a time: a reload must not happen under a document being laid out. */
export function renderPdf(content: ExportDocument): Promise<Buffer> {
  const render = lastRender.then(() => {
    reloadFonts();
    return renderToBuffer(<ReportDocument content={content} />);
  });
  lastRender = render.catch(() => undefined);
  return render;
}
