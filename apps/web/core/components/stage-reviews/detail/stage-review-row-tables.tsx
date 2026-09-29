import { useEffect, useState } from "react";
import { Lock, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewDetail, TStageReviewRowPayload, TStageReviewRowTable } from "@plane/types";
import { EStageReviewStatus } from "@plane/types";
import { cn } from "@plane/utils";
import { Block, BlockAction } from "./stage-review-content";

const I18N = "stage_review";

/** 一列：`key` 是行上的字段名，表头文案取 `fields.${labelKey}`；数字列只收非负整数 */
type TColumn = { key: string; labelKey: string; numeric?: boolean };

const GOODS_COLUMNS: TColumn[] = [
  { key: "akf_code", labelKey: "akf_code" },
  { key: "product_config", labelKey: "product_config" },
  { key: "production_quantity", labelKey: "production_quantity", numeric: true },
  { key: "baseline_archive_code", labelKey: "baseline_archive_code" },
];
const VERSION_COLUMNS: TColumn[] = [
  { key: "component", labelKey: "cv_component" },
  { key: "version", labelKey: "cv_version" },
];

/** 列宽均分；格线横竖同一个颜色，比区块分隔线深一档，隔着一臂也看得清 */
const LINE = "border-strong";
const CELL_CLASS = cn("flex min-w-0 items-center border-l px-3 first:border-l-0", LINE);

/** 一格文本：平时无边框，悬停浅底，聚焦蓝边；失焦或回车提交，值没变不发请求 */
const TextCell = ({
  value,
  editable,
  autoFocus,
  onCommit,
}: {
  value: string;
  editable: boolean;
  autoFocus?: boolean;
  onCommit: (next: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (!editable) {
    return (
      <span title={value} className={cn("truncate tabular-nums", !value && "text-placeholder")}>
        {value || "—"}
      </span>
    );
  }
  return (
    <input
      value={draft}
      autoFocus={autoFocus}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onBlur={() => {
        const next = draft.trim();
        if (next !== value) onCommit(next);
        else setDraft(value);
      }}
      className={cn(
        "-mx-2 h-7 w-[calc(100%+1rem)] min-w-0 rounded-md border border-transparent bg-transparent px-2 text-14 text-primary tabular-nums",
        "hover:bg-layer-1 focus:border-accent-strong focus:bg-surface-1 focus:outline-none"
      )}
    />
  );
};

type TRow = { id: string } & Record<string, unknown>;

/**
 * 一张可以加行的表：表头 + 行 + 末尾「添加一行」。
 * 没有行时整块不出，入口在「补充」条；删除按钮悬停才出，浮在行尾，不占列。
 */
const RowTable = ({
  title,
  summary,
  columns,
  rows,
  editable,
  isLocked,
  focusRowId,
  onAdd,
  onUpdate,
  onDelete,
}: {
  title: string;
  summary?: React.ReactNode;
  columns: TColumn[];
  rows: TRow[];
  editable: boolean;
  isLocked: boolean;
  focusRowId: string | null;
  onAdd: () => void;
  onUpdate: (rowId: string, payload: Record<string, string | number | null>) => void;
  onDelete: (rowId: string) => void;
}) => {
  const { t } = useTranslation();
  const gridStyle = { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` };

  const commit = (row: TRow, column: TColumn, next: string) => {
    if (!column.numeric) return onUpdate(row.id, { [column.key]: next });
    if (next === "") return onUpdate(row.id, { [column.key]: null });
    const parsed = Number(next.replace(/[,\s]/g, ""));
    // 填了非数字就当没改：那一列是 PositiveInteger，送过去只会拿到 400
    if (Number.isInteger(parsed) && parsed >= 0) onUpdate(row.id, { [column.key]: parsed });
  };

  if (rows.length === 0) return null;

  return (
    <Block
      title={title}
      count={rows.length}
      action={
        <>
          {summary}
          {isLocked && (
            <span className="flex items-center gap-1 text-12 text-placeholder">
              <Lock className="size-3" />
              {t(`${I18N}.detail.locked_hint`)}
            </span>
          )}
          {editable && (
            <BlockAction icon={Plus} label={t(`${I18N}.detail.add_row`)} onClick={onAdd} />
          )}
        </>
      }
    >
      <div className={cn("overflow-x-auto rounded-lg border bg-surface-1", LINE)}>
        <div className="min-w-[560px]">
          <div className="grid min-h-8 bg-layer-1 text-12 font-medium text-tertiary" style={gridStyle}>
            {columns.map((column) => (
              <span key={column.key} className={CELL_CLASS}>
                {t(`${I18N}.fields.${column.labelKey}`)}
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div
              key={row.id}
              className={cn("group relative grid min-h-10 border-t text-14 text-primary", LINE)}
              style={gridStyle}
            >
              {columns.map((column, index) => (
                <div key={column.key} className={CELL_CLASS}>
                  <TextCell
                    value={row[column.key] === null || row[column.key] === undefined ? "" : String(row[column.key])}
                    editable={editable}
                    autoFocus={index === 0 && row.id === focusRowId}
                    onCommit={(next) => commit(row, column, next)}
                  />
                </div>
              ))}
              {editable && (
                <button
                  type="button"
                  aria-label={t(`${I18N}.detail.delete_row`)}
                  title={t(`${I18N}.detail.delete_row`)}
                  onClick={() => onDelete(row.id)}
                  className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-md bg-surface-1 text-placeholder opacity-0 transition group-hover:opacity-100 hover:bg-danger-subtle hover:text-danger-primary focus:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <button
              type="button"
              onClick={onAdd}
              className={cn(
                "flex h-9 w-full items-center gap-1.5 border-t px-3 text-13 text-placeholder transition hover:bg-layer-1 hover:text-secondary",
                LINE
              )}
            >
              <Plus className="size-3.5" />
              {t(`${I18N}.detail.add_row`)}
            </button>
          )}
        </div>
      </div>
    </Block>
  );
};

/**
 * 「O阶段评审」正文里的两张表：成品与组件版本。
 *
 * 一次 O 阶段评审往往要过好几款成品、好几块板子，所以两项都是可以加行的表格，放在正文。
 * 点格子就改、失焦就存，走顶栏保存状态，不弹 toast。已评审后整张表只读。
 */
export const StageReviewRowTables = ({
  detail,
  editable,
  focusRowId,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
}: {
  detail: TStageReviewDetail;
  editable: boolean;
  focusRowId: string | null;
  onAddRow: (table: TStageReviewRowTable) => void;
  onUpdateRow: <T extends TStageReviewRowTable>(table: T, rowId: string, payload: TStageReviewRowPayload[T]) => void;
  onDeleteRow: (table: TStageReviewRowTable, rowId: string) => void;
}) => {
  const { t } = useTranslation();
  const isLocked = detail.status === EStageReviewStatus.COMPLETED;
  const goods = detail.finished_goods;
  const total = goods.reduce((sum, row) => sum + (row.production_quantity ?? 0), 0);

  const tableProps = (table: TStageReviewRowTable) => ({
    rows: detail[table] as TRow[],
    editable,
    isLocked,
    focusRowId,
    onAdd: () => onAddRow(table),
    onUpdate: (rowId: string, payload: Record<string, string | number | null>) =>
      onUpdateRow(table, rowId, payload as TStageReviewRowPayload[typeof table]),
    onDelete: (rowId: string) => onDeleteRow(table, rowId),
  });

  return (
    <>
      <RowTable
        title={t(`${I18N}.detail.finished_goods`)}
        summary={
          goods.length > 1 && (
            <span className="text-12 text-placeholder tabular-nums">
              {t(`${I18N}.detail.quantity_total`)} <b className="font-medium text-secondary">{total.toLocaleString()}</b>
            </span>
          )
        }
        columns={GOODS_COLUMNS}
        {...tableProps("finished_goods")}
      />
      <RowTable
        title={t(`${I18N}.detail.component_versions`)}
        columns={VERSION_COLUMNS}
        {...tableProps("component_versions")}
      />
    </>
  );
};

/**
 * 加一行并让新行第一格自动聚焦。抽出来是因为入口有两处：表格末尾「添加一行」，
 * 以及表格还没有行时「补充」条上的「成品 / 组件版本」。
 */
export const useStageReviewRowAdd = (
  detail: TStageReviewDetail,
  onCreateRow: (table: TStageReviewRowTable) => Promise<TStageReviewDetail | undefined>
) => {
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const addRow = async (table: TStageReviewRowTable) => {
    const known = new Set(detail[table].map((row) => row.id));
    const next = await onCreateRow(table);
    setFocusRowId(next?.[table].find((row) => !known.has(row.id))?.id ?? null);
  };
  return { focusRowId, addRow: (table: TStageReviewRowTable) => void addRow(table) };
};
