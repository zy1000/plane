import jsPDF from "jspdf";
import type { TReportAnalysis, TReportCaseRow, TReportDetail } from "@/services/qa/report.service";

const STATUS_META = [
  { key: "未执行", label: "未执行", color: "#bfbfbf" },
  { key: "成功", label: "成功", color: "#52c41a" },
  { key: "阻塞", label: "阻塞", color: "#faad14" },
  { key: "无效", label: "无效", color: "#3b5999" },
  { key: "失败", label: "失败", color: "#ff4d4f" },
] as const;

const PRIORITY_LABEL: Record<number, string> = { 0: "低", 1: "中", 2: "高" };
const RESULT_COLOR: Record<string, string> = {
  成功: "#16a34a",
  失败: "#dc2626",
  阻塞: "#d97706",
  无效: "#4b5563",
  未执行: "#6b7280",
};

const FONT_FAMILY = '"Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';
const CANVAS_SCALE = 2;

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
  align?: CanvasTextAlign;
  getValue: (row: TReportCaseRow) => string;
};

const sanitizeFilename = (value: string) =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const setFont = (ctx: CanvasRenderingContext2D, size: number, weight: number | "normal" | "bold" = "normal") => {
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const drawSectionTitle = (ctx: CanvasRenderingContext2D, title: string, x: number, y: number) => {
  ctx.fillStyle = "#2563eb";
  drawRoundedRect(ctx, x, y + 2, 4, 16, 2);
  ctx.fill();
  setFont(ctx, 12, 700);
  ctx.fillStyle = "#111827";
  ctx.fillText(title, x + 10, y + 15);
};

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

const fitText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const value = normalizeText(text);
  if (ctx.measureText(value).width <= maxWidth) return value;

  let result = "";
  for (const char of Array.from(value)) {
    if (ctx.measureText(`${result}${char}...`).width > maxWidth) break;
    result += char;
  }
  return result ? `${result}...` : "...";
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines?: number) => {
  const paragraphs = normalizeText(text).split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }

    let currentLine = "";
    for (const char of Array.from(paragraph)) {
      const nextLine = `${currentLine}${char}`;
      if (currentLine && ctx.measureText(nextLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = char;
        if (maxLines && lines.length >= maxLines) {
          const lastLine = lines[maxLines - 1];
          lines[maxLines - 1] = fitText(ctx, lastLine, maxWidth);
          return lines.slice(0, maxLines);
        }
      } else {
        currentLine = nextLine;
      }
    }
    lines.push(currentLine);
  }

  if (maxLines && lines.length > maxLines) {
    const limitedLines = lines.slice(0, maxLines);
    limitedLines[maxLines - 1] = fitText(ctx, limitedLines[maxLines - 1], maxWidth);
    return limitedLines;
  }

  return lines;
};

class PdfCanvasWriter {
  readonly pdf: jsPDF;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly margin = 36;
  readonly contentWidth: number;
  y = 36;
  private pageNumber = 0;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(filenameBase: string) {
    this.pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    this.pageWidth = this.pdf.internal.pageSize.getWidth();
    this.pageHeight = this.pdf.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - this.margin * 2;
    const page = this.createPageCanvas();
    this.canvas = page.canvas;
    this.ctx = page.ctx;
    this.preparePage(filenameBase);
  }

  get context() {
    return this.ctx;
  }

  get bottom() {
    return this.pageHeight - this.margin;
  }

  async ensureSpace(height: number) {
    if (this.y + height <= this.bottom) return;
    await this.addPage();
  }

  async addPage() {
    this.flushPage();
    await nextFrame();
    const page = this.createPageCanvas();
    this.canvas = page.canvas;
    this.ctx = page.ctx;
    this.preparePage();
  }

  save(filenameBase: string) {
    this.flushPage();
    this.pdf.save(`${sanitizeFilename(filenameBase) || "test-report"}.pdf`);
  }

  private createPageCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(this.pageWidth * CANVAS_SCALE);
    canvas.height = Math.ceil(this.pageHeight * CANVAS_SCALE);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 PDF 画布");

    ctx.scale(CANVAS_SCALE, CANVAS_SCALE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.pageWidth, this.pageHeight);
    ctx.textBaseline = "top";
    return { canvas, ctx };
  }

  private preparePage(filenameBase?: string) {
    this.y = this.margin;
    if (!filenameBase) {
      setFont(this.ctx, 9);
      this.ctx.fillStyle = "#6b7280";
      this.ctx.fillText("测试报告", this.margin, 22);
      this.y = this.margin + 10;
    }
  }

  private flushPage() {
    this.pageNumber += 1;
    setFont(this.ctx, 8);
    this.ctx.fillStyle = "#9ca3af";
    this.ctx.fillText(`Page ${this.pageNumber}`, this.pageWidth - this.margin - 36, this.pageHeight - 22);

    if (this.pageNumber > 1) this.pdf.addPage();
    this.pdf.addImage(this.canvas.toDataURL("image/png"), "PNG", 0, 0, this.pageWidth, this.pageHeight);
  }
}

const drawHeader = (writer: PdfCanvasWriter, detail: TReportDetail, title: string) => {
  const ctx = writer.context;
  setFont(ctx, 20, 700);
  const displayTitle = fitText(ctx, title, writer.contentWidth - (detail.report_type ? 96 : 0));
  ctx.fillStyle = "#111827";
  ctx.fillText(displayTitle, writer.margin, writer.y);

  const titleWidth = Math.min(ctx.measureText(displayTitle).width, writer.contentWidth - 90);
  if (detail.report_type) {
    setFont(ctx, 10, 700);
    const badgeText = detail.report_type;
    const badgeWidth = ctx.measureText(badgeText).width + 18;
    const badgeX = Math.min(writer.margin + titleWidth + 14, writer.pageWidth - writer.margin - badgeWidth);
    drawRoundedRect(ctx, badgeX, writer.y + 1, badgeWidth, 22, 5);
    ctx.fillStyle = detail.report_type === "对外报告" ? "#fef3c7" : "#dbeafe";
    ctx.fill();
    ctx.fillStyle = detail.report_type === "对外报告" ? "#92400e" : "#1d4ed8";
    ctx.fillText(badgeText, badgeX + 9, writer.y + 7);
  }

  writer.y += 34;
  setFont(ctx, 9);
  ctx.fillStyle = "#6b7280";
  const plans = detail.plans?.map((plan) => plan.name).filter(Boolean) ?? [];
  ctx.fillText(fitText(ctx, `关联计划：${plans.length ? plans.join("、") : "-"}`, writer.contentWidth), writer.margin, writer.y);
  writer.y += 24;
};

const drawMetrics = async (writer: PdfCanvasWriter, analysis: TReportAnalysis | null) => {
  await writer.ensureSpace(104);
  const ctx = writer.context;
  drawSectionTitle(ctx, "报告分析", writer.margin, writer.y);
  writer.y += 28;

  const metrics = [
    { label: "通过率", value: `${Number(analysis?.overall_pass_rate ?? 0).toFixed(2)}%`, color: "#16a34a" },
    { label: "执行完成率", value: `${Number(analysis?.completion_rate ?? 0).toFixed(2)}%`, color: "#2563eb" },
    { label: "计划个数", value: `${analysis?.plan_count ?? 0}`, color: "#7c3aed" },
    { label: "用例个数", value: `${analysis?.case_count ?? 0}`, color: "#0891b2" },
    { label: "缺陷总数", value: `${analysis?.pass_rate?.失败 ?? 0}`, color: "#dc2626" },
  ];

  const gap = 8;
  const cardWidth = (writer.contentWidth - gap * (metrics.length - 1)) / metrics.length;
  const cardHeight = 64;

  metrics.forEach((metric, index) => {
    const x = writer.margin + index * (cardWidth + gap);
    drawRoundedRect(ctx, x, writer.y, cardWidth, cardHeight, 6);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.stroke();

    setFont(ctx, 9);
    ctx.fillStyle = "#6b7280";
    ctx.fillText(metric.label, x + 10, writer.y + 10);
    setFont(ctx, 18, 700);
    ctx.fillStyle = metric.color;
    ctx.fillText(metric.value, x + 10, writer.y + 33);
  });

  writer.y += cardHeight + 20;
};

const drawExecutionChart = async (writer: PdfCanvasWriter, analysis: TReportAnalysis | null) => {
  await writer.ensureSpace(198);
  const ctx = writer.context;
  drawSectionTitle(ctx, "执行分析", writer.margin, writer.y);
  writer.y += 28;

  const x = writer.margin;
  const y = writer.y;
  const height = 148;
  drawRoundedRect(ctx, x, y, writer.contentWidth, height, 6);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#e5e7eb";
  ctx.stroke();

  const passRate = analysis?.pass_rate ?? {};
  const total = STATUS_META.reduce((sum, meta) => sum + Number(passRate[meta.key] || 0), 0);

  setFont(ctx, 11, 700);
  ctx.fillStyle = "#111827";
  ctx.fillText("执行分析", x + 14, y + 12);
  setFont(ctx, 9);
  ctx.fillStyle = "#6b7280";
  ctx.fillText(`总数(个) ${total}`, x + writer.contentWidth - 72, y + 13);

  const centerX = x + 116;
  const centerY = y + 84;
  const radius = 42;

  if (total > 0) {
    let angle = -Math.PI / 2;
    STATUS_META.forEach((meta) => {
      const count = Number(passRate[meta.key] || 0);
      if (!count) return;
      const slice = (count / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = meta.color;
      ctx.fill();
      angle += slice;
    });
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.56, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    setFont(ctx, 16, 700);
    ctx.fillStyle = "#111827";
    const totalText = String(total);
    ctx.fillText(totalText, centerX - ctx.measureText(totalText).width / 2, centerY - 9);
  } else {
    setFont(ctx, 11);
    ctx.fillStyle = "#9ca3af";
    ctx.fillText("暂无执行数据", centerX - 34, centerY - 6);
  }

  STATUS_META.forEach((meta, index) => {
    const rowY = y + 42 + index * 19;
    const count = Number(passRate[meta.key] || 0);
    const pct = total > 0 ? ((count / total) * 100).toFixed(2) : "0.00";
    ctx.fillStyle = meta.color;
    drawRoundedRect(ctx, x + 270, rowY + 2, 9, 9, 2);
    ctx.fill();
    setFont(ctx, 9);
    ctx.fillStyle = "#111827";
    ctx.fillText(meta.label, x + 286, rowY);
    ctx.fillStyle = "#6b7280";
    ctx.fillText(`${count} (${pct}%)`, x + 420, rowY);
  });

  writer.y += height + 20;
};

const drawSummary = async (writer: PdfCanvasWriter, summaryHtml: string) => {
  const ctx = writer.context;
  await writer.ensureSpace(72);
  drawSectionTitle(ctx, "报告总结", writer.margin, writer.y);
  writer.y += 28;

  setFont(ctx, 10);
  const summary = stripSummaryHtml(summaryHtml) || "暂无总结";
  const lines = wrapText(ctx, summary, writer.contentWidth - 24);
  const lineHeight = 15;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    await writer.ensureSpace(46);
    const boxTop = writer.y;
    const availableLines = Math.max(1, Math.floor((writer.bottom - writer.y - 18) / lineHeight));
    const pageLines = lines.slice(lineIndex, lineIndex + availableLines);
    const boxHeight = pageLines.length * lineHeight + 18;

    drawRoundedRect(ctx, writer.margin, boxTop, writer.contentWidth, boxHeight, 6);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#e5e7eb";
    ctx.stroke();

    setFont(ctx, 10);
    ctx.fillStyle = "#374151";
    pageLines.forEach((line, index) => {
      ctx.fillText(line, writer.margin + 12, boxTop + 9 + index * lineHeight);
    });

    writer.y += boxHeight + 8;
    lineIndex += pageLines.length;

    if (lineIndex < lines.length) await writer.addPage();
  }

  writer.y += 12;
};

const tableColumns: TTableColumn[] = [
  { key: "code", title: "编号", width: 58, getValue: (row) => row.code },
  { key: "name", title: "名称", width: 126, getValue: (row) => row.name },
  {
    key: "priority_label",
    title: "等级",
    width: 36,
    getValue: (row) => (row.priority === null || row.priority === undefined ? "-" : PRIORITY_LABEL[row.priority] ?? String(row.priority)),
  },
  { key: "result", title: "执行结果", width: 54, getValue: (row) => row.result },
  { key: "module", title: "所属模块", width: 70, getValue: (row) => row.module },
  { key: "assignee_name", title: "执行人", width: 58, getValue: (row) => row.assignee_name ?? "-" },
  { key: "defect_count", title: "缺陷数", width: 42, align: "center", getValue: (row) => String(row.defect_count || 0) },
  { key: "plan_name", title: "所属计划", width: 79, getValue: (row) => row.plan_name },
];

const drawTableHeader = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(x, y, 523, 26);
  ctx.strokeStyle = "#d1d5db";
  ctx.strokeRect(x, y, 523, 26);
  setFont(ctx, 8.5, 700);
  ctx.fillStyle = "#374151";

  let currentX = x;
  tableColumns.forEach((column) => {
    ctx.strokeStyle = "#d1d5db";
    ctx.strokeRect(currentX, y, column.width, 26);
    ctx.textAlign = column.align ?? "left";
    const textX = column.align === "center" ? currentX + column.width / 2 : currentX + 5;
    ctx.fillText(column.title, textX, y + 8);
    currentX += column.width;
  });
  ctx.textAlign = "left";
};

const drawTableRow = (ctx: CanvasRenderingContext2D, row: TReportCaseRow, x: number, y: number, height: number) => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, 523, height);
  ctx.strokeStyle = "#e5e7eb";
  ctx.strokeRect(x, y, 523, height);

  let currentX = x;
  tableColumns.forEach((column) => {
    ctx.strokeStyle = "#e5e7eb";
    ctx.strokeRect(currentX, y, column.width, height);
    setFont(ctx, 8.2);
    ctx.fillStyle = column.key === "defect_count" && row.defect_count ? "#dc2626" : RESULT_COLOR[row.result] && column.key === "result" ? RESULT_COLOR[row.result] : "#374151";
    ctx.textAlign = column.align ?? "left";
    const rawValue = column.getValue(row);
    const value = fitText(ctx, rawValue, column.width - 8);
    const textX = column.align === "center" ? currentX + column.width / 2 : currentX + 5;
    ctx.fillText(value, textX, y + 8);
    currentX += column.width;
  });
  ctx.textAlign = "left";
};

const drawTable = async (writer: PdfCanvasWriter, rows: TReportCaseRow[]) => {
  const ctx = writer.context;
  await writer.ensureSpace(76);
  drawSectionTitle(ctx, "执行明细", writer.margin, writer.y);
  writer.y += 28;

  const drawHeader = () => {
    drawTableHeader(ctx, writer.margin, writer.y);
    writer.y += 26;
  };

  drawHeader();

  if (!rows.length) {
    await writer.ensureSpace(34);
    setFont(ctx, 10);
    ctx.fillStyle = "#6b7280";
    ctx.fillText("暂无数据", writer.margin + 10, writer.y + 10);
    writer.y += 34;
    return;
  }

  const rowHeight = 28;
  for (const row of rows) {
    if (writer.y + rowHeight > writer.bottom) {
      await writer.addPage();
      drawSectionTitle(writer.context, "执行明细（续）", writer.margin, writer.y);
      writer.y += 28;
      drawTableHeader(writer.context, writer.margin, writer.y);
      writer.y += 26;
    }

    drawTableRow(writer.context, row, writer.margin, writer.y, rowHeight);
    writer.y += rowHeight;
  }
};

export const exportReportAsPdf = async ({ detail, analysis, rows, filenameBase }: TExportReportPdfParams) => {
  const reportTitle = detail.name || filenameBase || "测试报告";
  const writer = new PdfCanvasWriter(reportTitle);

  drawHeader(writer, detail, reportTitle);
  await drawMetrics(writer, analysis);
  await drawExecutionChart(writer, analysis);
  await drawSummary(writer, detail.summary_html ?? "");
  await drawTable(writer, rows);

  writer.save(filenameBase || reportTitle);
};
