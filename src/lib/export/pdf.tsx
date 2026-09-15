import path from "node:path";

import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

import { exportColumnWidths, formatExportValue, isNumericFormat, type ExportDocument } from ".";

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
const LONG_WORD_PART = /.{1,16}/gu;

// The built-in hyphenation follows English rules, so words are kept whole. Only a token too long
// for a narrow column, such as a long login, is cut into parts the line may break between.
Font.registerHyphenationCallback((word) =>
  word.length > LONG_WORD_LENGTH ? (word.match(LONG_WORD_PART) ?? [word]) : [word],
);

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 40,
    fontFamily: FONT_FAMILY,
    fontSize: 8,
    color: "#0f172a",
  },
  header: { marginBottom: 10 },
  title: { fontSize: 14, fontWeight: "bold", marginBottom: 2 },
  meta: { fontSize: 9, color: "#475569" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#cbd5e1" },
  headerRow: { backgroundColor: "#f1f5f9", borderTopWidth: 0.5 },
  cell: { flexBasis: 0, paddingVertical: 3, paddingHorizontal: 4 },
  headerCell: { fontWeight: "bold" },
  numeric: { textAlign: "right" },
  empty: { paddingVertical: 12, textAlign: "center", color: "#475569" },
  pageNumber: { position: "absolute", right: 28, bottom: 20, color: "#475569" },
});

function ReportDocument({ content }: { content: ExportDocument }) {
  const { title, columns, rows, labels } = content;
  const widths = exportColumnWidths(content);
  const cellStyles = columns.map((column, index) => [
    styles.cell,
    { flexGrow: widths[index] },
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
