/**
 * 用例活动里「内容型改动」的对照模型。
 *
 * 富文本字段和步骤的正文塞不进一行文字，后端把改动两侧的原文放在 activity.extra 里，
 * 这里把它还原成结构（表格 / 段落 / 步骤）再逐行逐格比，供活动流展开时渲染。
 */
import { diffArrays, type ArrayChange } from "diff";
import type { TTestCaseActivity } from "@plane/types";
import { htmlToPlainText } from "@/components/common/inline-text-diff";

/** 走结构化对照的富文本字段；其余字段仍是一行「旧值 → 新值」 */
export const RICH_TEXT_FIELDS = new Set(["precondition", "text_description", "text_result", "remark"]);

export type TCaseStep = { description?: string; result?: string };

export type TTableCellDiff = { before: string; after: string; changed: boolean };
export type TTableRowDiff = { op: "same" | "add" | "del" | "chg"; cells: TTableCellDiff[] };
export type TTableDiff = {
  rows: TTableRowDiff[];
  columns: number;
  addedRows: number;
  removedRows: number;
  changedCells: number;
};

export type TRichTextChange = {
  /** 两侧一一对应的表格对照，按文档顺序 */
  tables: TTableDiff[];
  /** 表格以外的正文，交给行内词级 diff */
  textBefore: string;
  textAfter: string;
  /** 表格数量对不上时不做逐表对照，整体回落成正文 diff */
  tablesComparable: boolean;
};

export type TStepDiff = { op: "add" | "del" | "chg"; index: number; before?: TCaseStep; after?: TCaseStep };

/** 富文本按文档顺序拆成的块，表格保结构，其余归成正文 */
export type TContentBlock = { type: "table"; rows: string[][] } | { type: "text"; text: string };

/** 拼行/步骤指纹用的分隔符，取正文不会出现的控制字符，
 *  避免 ["ab","c"] 和 ["a","bc"] 撞成同一行 */
const CELL_SEP = "\u0001";
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

const readTableRows = (table: HTMLTableElement): string[][] =>
  Array.from(table.rows).map((row) => Array.from(row.cells).map((cell) => normalize(cell.textContent ?? "")));

/**
 * 把一段富文本按文档顺序拆成块。
 *
 * 表格可能被 tableWrapper 之类的容器包着，所以每个顶层节点都往里找一层 table，
 * 找到就单独成块，找不到才归进正文。
 */
export const parseContentBlocks = (html: string): TContentBlock[] => {
  if (!html) return [];
  // SSR 下没有 DOMParser：整段当正文，表格对照留给客户端渲染时再算
  if (typeof DOMParser === "undefined") return [{ type: "text", text: htmlToPlainText(html) }];

  const body = new DOMParser().parseFromString(html, "text/html").body;
  const blocks: TContentBlock[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) blocks.push({ type: "text", text });
    buffer = [];
  };

  Array.from(body.children).forEach((element) => {
    const tables =
      element.tagName === "TABLE" ? [element as HTMLTableElement] : Array.from(element.querySelectorAll("table"));
    if (tables.length === 0) {
      const text = htmlToPlainText(element.outerHTML);
      if (text) buffer.push(text);
      return;
    }
    flush();
    tables.forEach((table) => blocks.push({ type: "table", rows: readTableRows(table as HTMLTableElement) }));
  });
  flush();
  return blocks;
};

const splitContent = (html: string): { tables: string[][][]; text: string } => {
  const blocks = parseContentBlocks(html);
  return {
    tables: blocks.flatMap((block) => (block.type === "table" ? [block.rows] : [])),
    text: blocks
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim(),
  };
};

const rowKey = (cells: string[]) => cells.join(CELL_SEP);

const sameRow = (cells: string[]): TTableRowDiff => ({
  op: "same",
  cells: cells.map((value) => ({ before: value, after: value, changed: false })),
});

const oneSidedRow = (cells: string[], op: "add" | "del"): TTableRowDiff => ({
  op,
  cells: cells.map((value) => ({
    before: op === "del" ? value : "",
    after: op === "add" ? value : "",
    changed: true,
  })),
});

const changedRow = (before: string[], after: string[]): TTableRowDiff => {
  const width = Math.max(before.length, after.length);
  const cells: TTableCellDiff[] = [];
  for (let i = 0; i < width; i++) {
    const b = before[i] ?? "";
    const a = after[i] ?? "";
    cells.push({ before: b, after: a, changed: b !== a });
  }
  return { op: "chg", cells };
};

/**
 * 表格逐行对照。
 *
 * jsdiff 只会给出「删掉这几行、加了这几行」，直接渲染就变成一片红加一片绿；
 * 这里把紧挨着的删除段和新增段按位置配对成「改动行」，再逐格比出到底改了哪一格。
 */
export const diffTableRows = (before: string[][], after: string[][]): TTableDiff => {
  const changes = diffArrays(before.map(rowKey), after.map(rowKey)) as ArrayChange<string>[] | undefined;
  const columns = Math.max(0, ...before.map((row) => row.length), ...after.map((row) => row.length));

  if (!changes) {
    return {
      rows: [...before.map((row) => oneSidedRow(row, "del")), ...after.map((row) => oneSidedRow(row, "add"))],
      columns,
      addedRows: after.length,
      removedRows: before.length,
      changedCells: 0,
    };
  }

  const rows: TTableRowDiff[] = [];
  let beforeAt = 0;
  let afterAt = 0;
  let addedRows = 0;
  let removedRows = 0;
  let changedCells = 0;
  let i = 0;

  while (i < changes.length) {
    const change = changes[i];

    if (!change.added && !change.removed) {
      change.value.forEach(() => {
        rows.push(sameRow(after[afterAt] ?? before[beforeAt] ?? []));
        beforeAt++;
        afterAt++;
      });
      i++;
      continue;
    }

    if (change.removed) {
      const next = changes[i + 1];
      const addedCount = next?.added ? next.value.length : 0;
      const removedCount = change.value.length;
      const paired = Math.min(removedCount, addedCount);

      for (let k = 0; k < paired; k++) {
        const row = changedRow(before[beforeAt++] ?? [], after[afterAt++] ?? []);
        changedCells += row.cells.filter((cell) => cell.changed).length;
        rows.push(row);
      }
      for (let k = paired; k < removedCount; k++) {
        rows.push(oneSidedRow(before[beforeAt++] ?? [], "del"));
        removedRows++;
      }
      for (let k = paired; k < addedCount; k++) {
        rows.push(oneSidedRow(after[afterAt++] ?? [], "add"));
        addedRows++;
      }
      i += next?.added ? 2 : 1;
      continue;
    }

    change.value.forEach(() => {
      rows.push(oneSidedRow(after[afterAt++] ?? [], "add"));
      addedRows++;
    });
    i++;
  }

  return { rows, columns, addedRows, removedRows, changedCells };
};

export const buildRichTextChange = (oldHtml: string, newHtml: string): TRichTextChange => {
  const before = splitContent(oldHtml);
  const after = splitContent(newHtml);
  const tablesComparable = before.tables.length > 0 && before.tables.length === after.tables.length;
  return {
    tables: tablesComparable ? before.tables.map((rows, index) => diffTableRows(rows, after.tables[index])) : [],
    textBefore: before.text,
    textAfter: after.text,
    tablesComparable,
  };
};

const stepKey = (step: TCaseStep) => `${normalize(step?.description ?? "")}${CELL_SEP}${normalize(step?.result ?? "")}`;

/** 步骤逐条对照，配对规则同表格；index 是在改后列表里的序号（纯删除的步骤给改前序号） */
export const diffSteps = (before: TCaseStep[], after: TCaseStep[]): TStepDiff[] => {
  const changes = diffArrays(before.map(stepKey), after.map(stepKey)) as ArrayChange<string>[] | undefined;
  if (!changes) return [];

  const diffs: TStepDiff[] = [];
  let beforeAt = 0;
  let afterAt = 0;
  let i = 0;

  while (i < changes.length) {
    const change = changes[i];

    if (!change.added && !change.removed) {
      change.value.forEach(() => {
        beforeAt++;
        afterAt++;
      });
      i++;
      continue;
    }

    if (change.removed) {
      const next = changes[i + 1];
      const addedCount = next?.added ? next.value.length : 0;
      const removedCount = change.value.length;
      const paired = Math.min(removedCount, addedCount);

      for (let k = 0; k < paired; k++) {
        diffs.push({ op: "chg", index: afterAt + 1, before: before[beforeAt++], after: after[afterAt++] });
      }
      for (let k = paired; k < removedCount; k++) {
        diffs.push({ op: "del", index: beforeAt + 1, before: before[beforeAt++] });
      }
      for (let k = paired; k < addedCount; k++) {
        diffs.push({ op: "add", index: afterAt + 1, after: after[afterAt++] });
      }
      i += next?.added ? 2 : 1;
      continue;
    }

    change.value.forEach(() => {
      diffs.push({ op: "add", index: afterAt + 1, after: after[afterAt++] });
    });
    i++;
  }

  return diffs;
};

/** 正文塞不进一行、需要展开对照的活动 */
export const isContentChangeActivity = (activity: TTestCaseActivity): boolean =>
  activity.verb === "updated" && (activity.field === "steps" || RICH_TEXT_FIELDS.has(activity.field ?? ""));

/** 后端在 extra 里带的原文；内容过大时只有 too_large，前端回落到纯文本摘要 */
export const readRichTextExtra = (activity: TTestCaseActivity): { oldHtml: string; newHtml: string } | null => {
  const extra = activity.extra;
  if (!extra || typeof extra.old_html !== "string" || typeof extra.new_html !== "string") return null;
  return { oldHtml: extra.old_html, newHtml: extra.new_html };
};

export const readStepsExtra = (activity: TTestCaseActivity): { before: TCaseStep[]; after: TCaseStep[] } | null => {
  const extra = activity.extra;
  if (!extra || !Array.isArray(extra.old_steps) || !Array.isArray(extra.new_steps)) return null;
  return { before: extra.old_steps as TCaseStep[], after: extra.new_steps as TCaseStep[] };
};
