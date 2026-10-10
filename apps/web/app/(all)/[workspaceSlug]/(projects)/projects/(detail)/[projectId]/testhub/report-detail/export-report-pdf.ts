import jsPDF from "jspdf";
import wqyFontUrl from "@/app/assets/fonts/wqy-zenhei/wqy-zenhei-pdf.ttf?url";
import type { TReportAnalysis, TReportCaseRow, TReportDetail } from "@/services/qa/report.service";

/**
 * 测试报告导出 PDF。
 * 文字全部走 jsPDF 的文字接口（嵌入文泉驿正黑子集，jsPDF 只打包用到的字形），
 * 饼图用矢量路径画；整份文件不含位图，1000 条明细也只有几 MB 以内。
 */

const STATUS_META = [
  { key: "成功", label: "成功", color: "#22a35a" },
  { key: "阻塞", label: "阻塞", color: "#e8961c" },
  { key: "失败", label: "失败", color: "#e5484d" },
  { key: "无效", label: "无效", color: "#5b7bb5" },
  { key: "未执行", label: "未执行", color: "#c9ced6" },
] as const;

const PRIORITY_LABEL: Record<number, string> = { 0: "低", 1: "中", 2: "高" };
const RESULT_COLOR: Record<string, string> = {
  成功: "#16a34a",
  失败: "#dc2626",
  阻塞: "#d97706",
  无效: "#4b5563",
  未执行: "#6b7280",
};

const COLOR = {
  text: "#111827",
  body: "#374151",
  muted: "#6b7280",
  faint: "#9ca3af",
  border: "#e5e7eb",
  borderStrong: "#d1d5db",
  headFill: "#f3f4f6",
  accent: "#2563eb",
  white: "#ffffff",
};

const FONT_NAME = "WQYZenHei";
const FONT_FILE = "wqy-zenhei-pdf.ttf";
const TOTAL_PAGES_PLACEHOLDER = "{total_pages}";

type TExportReportPdfParams = {
  detail: TReportDetail;
  analysis: TReportAnalysis | null;
  rows: TReportCaseRow[];
  filenameBase: string;
};

type TTableColumn = {
  key: keyof TReportCaseRow | "priority_label";
  title: string;
  width: number;
  align?: "left" | "center";
  getValue: (row: TReportCaseRow) => string;
};

const sanitizeFilename = (value: string) =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);

const normalizeText = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || "-";
};

const stripSummaryHtml = (html: string) => {
  if (!html) return "";

  const normalizedHtml = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return normalizedHtml.replace(/<[^>]+>/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  const doc = new DOMParser().parseFromString(normalizedHtml, "text/html");
  return (doc.body.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
};

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ---------- 字体：首次导出时拉一次，之后复用 ----------

let fontDataPromise: Promise<string> | null = null;

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("字体读取失败"));
    reader.readAsDataURL(blob);
  });

const loadFontData = () => {
  if (!fontDataPromise) {
    fontDataPromise = fetch(wqyFontUrl)
      .then((res) => {
        if (!res.ok) throw new Error("PDF 字体加载失败");
        return res.blob();
      })
      .then(blobToBase64)
      .catch((error) => {
        fontDataPromise = null;
        throw error;
      });
  }
  return fontDataPromise;
};

// ---------- 页面写入器 ----------

class PdfWriter {
  readonly doc: jsPDF;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly margin = 36;
  readonly contentWidth: number;
  y = 36;
  private pageNumber = 1;

  constructor(fontData: string) {
    this.doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
    this.doc.addFileToVFS(FONT_FILE, fontData);
    this.doc.addFont(FONT_FILE, FONT_NAME, "normal");
    this.doc.setFont(FONT_NAME, "normal");
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - this.margin * 2;
    this.preparePage(true);
  }

  get bottom() {
    return this.pageHeight - this.margin;
  }

  font(size: number, color: string = COLOR.body) {
    this.doc.setFontSize(size);
    this.doc.setTextColor(color);
  }

  /** 顶对齐写一行，和 canvas 版 textBaseline=top 的坐标习惯一致 */
  text(value: string, x: number, y: number, align: "left" | "center" | "right" = "left") {
    this.doc.text(value, x, y, { baseline: "top", align });
  }

  width(value: string) {
    return this.doc.getTextWidth(value);
  }

  fitText(value: unknown, maxWidth: number) {
    const text = normalizeText(value);
    if (this.width(text) <= maxWidth) return text;
    let result = "";
    for (const char of Array.from(text)) {
      if (this.width(`${result}${char}...`) > maxWidth) break;
      result += char;
    }
    return result ? `${result}...` : "...";
  }

  wrapText(value: unknown, maxWidth: number) {
    const lines: string[] = [];
    for (const paragraph of normalizeText(value).split(/\r?\n/)) {
      if (!paragraph) {
        lines.push("");
        continue;
      }
      let current = "";
      for (const char of Array.from(paragraph)) {
        const next = `${current}${char}`;
        if (current && this.width(next) > maxWidth) {
          lines.push(current);
          current = char;
        } else {
          current = next;
        }
      }
      lines.push(current);
    }
    return lines;
  }

  box(x: number, y: number, w: number, h: number, options?: { fill?: string; stroke?: string; radius?: number }) {
    const fill = options?.fill;
    const stroke = options?.stroke;
    if (fill) this.doc.setFillColor(fill);
    if (stroke) {
      this.doc.setDrawColor(stroke);
      this.doc.setLineWidth(0.75);
    }
    const style = fill && stroke ? "FD" : fill ? "F" : "S";
    const r = options?.radius ?? 0;
    if (r > 0) this.doc.roundedRect(x, y, w, h, r, r, style);
    else this.doc.rect(x, y, w, h, style);
  }

  sectionTitle(title: string) {
    this.box(this.margin, this.y + 2, 4, 16, { fill: COLOR.accent, radius: 2 });
    this.font(12, COLOR.text);
    this.text(title, this.margin + 10, this.y + 3);
  }

  ensureSpace(height: number) {
    if (this.y + height <= this.bottom) return;
    this.addPage();
  }

  addPage() {
    this.doc.addPage();
    this.pageNumber += 1;
    this.preparePage(false);
  }

  private preparePage(first: boolean) {
    this.y = this.margin;
    if (!first) {
      this.font(9, COLOR.muted);
      this.text("测试报告", this.margin, 16);
      this.y = this.margin + 10;
    }
    this.font(8, COLOR.faint);
    this.text(`第 ${this.pageNumber} / ${TOTAL_PAGES_PLACEHOLDER} 页`, this.pageWidth - this.margin, this.pageHeight - 26, "right");
  }

  save(filenameBase: string) {
    this.doc.putTotalPages(TOTAL_PAGES_PLACEHOLDER);
    this.doc.save(`${sanitizeFilename(filenameBase) || "test-report"}.pdf`);
  }
}

// ---------- 各区块 ----------

const drawHeader = (writer: PdfWriter, detail: TReportDetail, title: string) => {
  writer.font(18, COLOR.text);
  const badgeReserve = detail.report_type ? 96 : 0;
  const displayTitle = writer.fitText(title, writer.contentWidth - badgeReserve);
  writer.text(displayTitle, writer.margin, writer.y);
  const titleWidth = Math.min(writer.width(displayTitle), writer.contentWidth - 90);

  if (detail.report_type) {
    writer.font(9.5, COLOR.text);
    const badgeText = detail.report_type;
    const badgeWidth = writer.width(badgeText) + 18;
    const badgeX = Math.min(writer.margin + titleWidth + 12, writer.pageWidth - writer.margin - badgeWidth);
    const external = detail.report_type === "对外报告";
    writer.box(badgeX, writer.y + 2, badgeWidth, 20, { fill: external ? "#fef3c7" : "#dbeafe", radius: 5 });
    writer.font(9.5, external ? "#92400e" : "#1d4ed8");
    writer.text(badgeText, badgeX + 9, writer.y + 6.5);
  }

  writer.y += 32;
  writer.font(9, COLOR.muted);
  const plans = detail.plans?.map((plan) => plan.name).filter(Boolean) ?? [];
  writer.text(
    writer.fitText(`关联计划：${plans.length ? plans.join("、") : "-"}`, writer.contentWidth),
    writer.margin,
    writer.y
  );
  writer.y += 14;
  const creator = detail.created_by_detail?.display_name;
  const metaParts = [
    detail.module_name ? `所属模块：${detail.module_name}` : null,
    creator ? `创建人：${creator}` : null,
    `创建于 ${formatDateTime(detail.created_at)}`,
    `导出于 ${formatDateTime(new Date())}`,
  ].filter(Boolean);
  writer.text(writer.fitText(metaParts.join("    "), writer.contentWidth), writer.margin, writer.y);
  writer.y += 24;
};

const drawMetrics = (writer: PdfWriter, analysis: TReportAnalysis | null) => {
  writer.ensureSpace(104);
  writer.sectionTitle("报告分析");
  writer.y += 28;

  const metrics = [
    { label: "通过率", value: `${Number(analysis?.overall_pass_rate ?? 0).toFixed(2)}%`, color: "#16a34a" },
    { label: "执行完成率", value: `${Number(analysis?.completion_rate ?? 0).toFixed(2)}%`, color: "#2563eb" },
    { label: "计划个数", value: `${analysis?.plan_count ?? 0}`, color: "#7c3aed" },
    { label: "用例个数", value: `${analysis?.case_count ?? 0}`, color: "#0891b2" },
    { label: "缺陷总数", value: `${analysis?.defect_count ?? 0}`, color: "#dc2626" },
  ];

  const gap = 8;
  const cardWidth = (writer.contentWidth - gap * (metrics.length - 1)) / metrics.length;
  const cardHeight = 60;

  metrics.forEach((metric, index) => {
    const x = writer.margin + index * (cardWidth + gap);
    writer.box(x, writer.y, cardWidth, cardHeight, { fill: COLOR.white, stroke: COLOR.border, radius: 6 });
    writer.font(8.5, COLOR.muted);
    writer.text(metric.label, x + 10, writer.y + 10);
    writer.font(17, metric.color);
    writer.text(metric.value, x + 10, writer.y + 28);
  });

  writer.y += cardHeight + 20;
};

/** 用贝塞尔曲线画一段圆弧（≤90° 一段），返回 jsPDF path 的 c 段 */
const arcSegments = (cx: number, cy: number, r: number, start: number, end: number) => {
  const segments: { op: "c"; c: number[] }[] = [];
  const total = end - start;
  const count = Math.max(1, Math.ceil(Math.abs(total) / (Math.PI / 2)));
  const step = total / count;
  const k = (4 / 3) * Math.tan(step / 4);
  let angle = start;
  for (let i = 0; i < count; i++) {
    const a1 = angle;
    const a2 = angle + step;
    const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    const p2 = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
    const c1 = [p1[0] - k * r * Math.sin(a1), p1[1] + k * r * Math.cos(a1)];
    const c2 = [p2[0] + k * r * Math.sin(a2), p2[1] - k * r * Math.cos(a2)];
    segments.push({ op: "c", c: [c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]] });
    angle = a2;
  }
  return segments;
};

const drawDonutSlice = (
  writer: PdfWriter,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
  color: string
) => {
  const outerArc = arcSegments(cx, cy, outer, start, end);
  const innerArc = arcSegments(cx, cy, inner, end, start);
  writer.doc.setFillColor(color);
  writer.doc.path(
    [
      { op: "m", c: [cx + outer * Math.cos(start), cy + outer * Math.sin(start)] },
      ...outerArc,
      { op: "l", c: [cx + inner * Math.cos(end), cy + inner * Math.sin(end)] },
      ...innerArc,
      { op: "h", c: [] },
    ],
    "f"
  );
};

const drawExecutionChart = (writer: PdfWriter, analysis: TReportAnalysis | null) => {
  writer.ensureSpace(198);
  writer.sectionTitle("执行分析");
  writer.y += 28;

  const x = writer.margin;
  const y = writer.y;
  const height = 148;
  writer.box(x, y, writer.contentWidth, height, { fill: COLOR.white, stroke: COLOR.border, radius: 6 });

  const passRate = analysis?.pass_rate ?? {};
  const total = STATUS_META.reduce((sum, meta) => sum + Number(passRate[meta.key] || 0), 0);

  writer.font(10.5, COLOR.text);
  writer.text("执行结果分布", x + 14, y + 12);
  writer.font(9, COLOR.muted);
  writer.text(`总数 ${total}`, x + writer.contentWidth - 14, y + 13, "right");

  const centerX = x + 116;
  const centerY = y + 84;
  const radius = 42;
  const innerRadius = radius * 0.56;

  if (total > 0) {
    let angle = -Math.PI / 2;
    STATUS_META.forEach((meta) => {
      const count = Number(passRate[meta.key] || 0);
      if (!count) return;
      const slice = (count / total) * Math.PI * 2;
      drawDonutSlice(writer, centerX, centerY, radius, innerRadius, angle, angle + slice, meta.color);
      angle += slice;
    });
    writer.font(15, COLOR.text);
    writer.text(String(total), centerX, centerY - 8, "center");
  } else {
    writer.font(10.5, COLOR.faint);
    writer.text("暂无执行数据", centerX, centerY - 6, "center");
  }

  STATUS_META.forEach((meta, index) => {
    const rowY = y + 42 + index * 19;
    const count = Number(passRate[meta.key] || 0);
    const pct = total > 0 ? ((count / total) * 100).toFixed(2) : "0.00";
    writer.box(x + 270, rowY + 2, 9, 9, { fill: meta.color, radius: 2 });
    writer.font(9, COLOR.text);
    writer.text(meta.label, x + 286, rowY);
    writer.font(9, COLOR.muted);
    writer.text(`${count} (${pct}%)`, x + 420, rowY);
  });

  writer.y += height + 20;
};

const drawSummary = (writer: PdfWriter, summaryHtml: string) => {
  writer.ensureSpace(72);
  writer.sectionTitle("报告总结");
  writer.y += 28;

  writer.font(10, COLOR.body);
  const summary = stripSummaryHtml(summaryHtml) || "暂无总结";
  const lines = writer.wrapText(summary, writer.contentWidth - 24);
  const lineHeight = 15;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    writer.ensureSpace(46);
    const boxTop = writer.y;
    const availableLines = Math.max(1, Math.floor((writer.bottom - writer.y - 18) / lineHeight));
    const pageLines = lines.slice(lineIndex, lineIndex + availableLines);
    const boxHeight = pageLines.length * lineHeight + 18;

    writer.box(writer.margin, boxTop, writer.contentWidth, boxHeight, { fill: COLOR.white, stroke: COLOR.border, radius: 6 });
    writer.font(10, COLOR.body);
    pageLines.forEach((line, index) => {
      if (line) writer.text(line, writer.margin + 12, boxTop + 9 + index * lineHeight);
    });

    writer.y += boxHeight + 8;
    lineIndex += pageLines.length;
    if (lineIndex < lines.length) writer.addPage();
  }

  writer.y += 12;
};

const tableColumns: TTableColumn[] = [
  { key: "code", title: "编号", width: 70, getValue: (row) => row.code },
  { key: "name", title: "名称", width: 126, getValue: (row) => row.name },
  {
    key: "priority_label",
    title: "等级",
    width: 26,
    align: "center",
    getValue: (row) =>
      row.priority === null || row.priority === undefined ? "-" : (PRIORITY_LABEL[row.priority] ?? String(row.priority)),
  },
  { key: "result", title: "执行结果", width: 40, getValue: (row) => row.result },
  { key: "module", title: "所属模块", width: 56, getValue: (row) => row.module },
  { key: "assignee_name", title: "执行人", width: 46, getValue: (row) => row.assignee_name ?? "-" },
  { key: "defect_count", title: "缺陷", width: 26, align: "center", getValue: (row) => String(row.defect_count || 0) },
  { key: "plan_name", title: "所属计划", width: 133, getValue: (row) => row.plan_name },
];
const TABLE_WIDTH = tableColumns.reduce((sum, column) => sum + column.width, 0);
const HEAD_HEIGHT = 24;
const ROW_HEIGHT = 22;

const drawTableHeader = (writer: PdfWriter) => {
  const y = writer.y;
  let x = writer.margin;
  writer.box(x, y, TABLE_WIDTH, HEAD_HEIGHT, { fill: COLOR.headFill, stroke: COLOR.borderStrong });
  writer.font(8.5, COLOR.body);
  tableColumns.forEach((column) => {
    writer.box(x, y, column.width, HEAD_HEIGHT, { stroke: COLOR.borderStrong });
    const textX = column.align === "center" ? x + column.width / 2 : x + 5;
    writer.text(column.title, textX, y + 7.5, column.align ?? "left");
    x += column.width;
  });
  writer.y += HEAD_HEIGHT;
};

const drawTableRow = (writer: PdfWriter, row: TReportCaseRow) => {
  const y = writer.y;
  let x = writer.margin;
  writer.font(8.2, COLOR.body);
  tableColumns.forEach((column) => {
    writer.box(x, y, column.width, ROW_HEIGHT, { stroke: COLOR.border });
    const color =
      column.key === "defect_count" && row.defect_count
        ? "#dc2626"
        : column.key === "result"
          ? (RESULT_COLOR[row.result] ?? COLOR.body)
          : COLOR.body;
    writer.font(8.2, color);
    const value = writer.fitText(column.getValue(row), column.width - 8);
    const textX = column.align === "center" ? x + column.width / 2 : x + 5;
    writer.text(value, textX, y + 7, column.align ?? "left");
    x += column.width;
  });
  writer.y += ROW_HEIGHT;
};

const drawTable = (writer: PdfWriter, rows: TReportCaseRow[]) => {
  writer.ensureSpace(76);
  writer.sectionTitle("执行明细");
  writer.y += 28;
  drawTableHeader(writer);

  if (!rows.length) {
    writer.ensureSpace(34);
    writer.font(10, COLOR.muted);
    writer.text("暂无数据", writer.margin + 10, writer.y + 10);
    writer.y += 34;
    return;
  }

  for (const row of rows) {
    if (writer.y + ROW_HEIGHT > writer.bottom) {
      writer.addPage();
      writer.sectionTitle("执行明细（续）");
      writer.y += 28;
      drawTableHeader(writer);
    }
    drawTableRow(writer, row);
  }
};

export const exportReportAsPdf = async ({ detail, analysis, rows, filenameBase }: TExportReportPdfParams) => {
  const reportTitle = detail.name || filenameBase || "测试报告";
  const fontData = await loadFontData();
  const writer = new PdfWriter(fontData);

  drawHeader(writer, detail, reportTitle);
  drawMetrics(writer, analysis);
  drawExecutionChart(writer, analysis);
  drawSummary(writer, detail.summary_html ?? "");
  drawTable(writer, rows);

  writer.save(filenameBase || reportTitle);
};
