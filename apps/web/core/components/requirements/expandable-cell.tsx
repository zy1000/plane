/**
 * 「内联控件 + 展开按钮 + 弹窗」的单元格外壳，单行文本与富文本两种单元格共用。
 *
 * 网格列宽只有 160px，稍长的内容就得有个地方摊开看、摊开改；两种字段的外壳长得
 * 不一样，是这类表单最容易积累的不一致，所以收在这一份里。
 */
import type { ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { Modal } from "antd";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

export type TExpandableCellVariant = "grid" | "compact" | "detail" | "modal";

/**
 * 静息底色的配方，与 requirement-grid-shared 的 FIELD_INPUT_CLASS 同名同义，只是焦点
 * 落在内部的输入框上，焦点态得用 focus-within；定高也换成最小高度，摘要能折到三行。
 *
 * grid 铺满整格（td 走 REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS，不带内边距），文字贴着
 * 格线排。py-3 是为了在 44px 行高里把单行文字压到垂直居中（12 + 20 + 12），同时留着
 * items-start，富文本摘要折到三行时往下长而不是把首行顶歪。
 * grid 这套只管排版：hover 底色与焦点描边归格子管（REQUIREMENT_GRID_CELL_EDITABLE_CLASS）
 * —— 这层外壳是定高的，rowSpan 撑高的格子里它只占中间一截，画不满。
 * compact 是详情页子表单那张小表：宿主 td 自带 px-2.5 py-1.5、表头才 text-11，控件铺满
 * 会把它撑成主网格的尺寸，所以那里保留原来「格子里一个小方框」的紧凑配方。
 */
const SHELL_CLASS = {
  grid: "min-h-11 rounded-none border-0 bg-transparent px-page-x py-3 text-14",
  // 焦点态照原意是「蓝边框 + 淡光晕」，但 accent-primary 没有 border-color / ring-color
  // 命名空间，原来的 border-accent-primary 与 ring-accent-primary/10 都是无效类 ——
  // 边框压根没变色，ring 的颜色落回 currentcolor 渲染成近黑。换成有效的 accent-strong
  compact:
    "focus-within:ring-accent-strong/10 min-h-8 border-transparent bg-transparent px-2 py-1.5 text-14 hover:border-subtle hover:bg-layer-1 focus-within:border-accent-strong focus-within:bg-surface-1 focus-within:ring-2",
  // -mx-2 把焦点框的左右内边距吐回去，值和上面的字段名齐左；hover / 焦点仍有可点面积
  detail:
    "min-h-8 -mx-2 border-transparent bg-transparent px-2 py-1.5 text-body-sm-regular hover:bg-layer-transparent-hover focus-within:border-accent-primary focus-within:bg-surface-1",
  // 建行弹窗：与工作项 ExtraFieldControl 同皮（见 FIELD_INPUT_CLASS.modal）
  modal:
    "min-h-[38px] border-[0.5px] border-subtle-1 bg-layer-2 px-3 py-2 text-13 focus-within:border-accent-primary",
} as const;

/** 内联输入框：底子全交给外壳，自己只留文字 */
export const EXPANDABLE_CELL_INPUT_CLASS =
  "h-5 w-full min-w-0 flex-1 bg-transparent leading-5 text-primary outline-none placeholder:text-placeholder";

export const ExpandableCell = ({
  variant,
  onExpand,
  children,
}: {
  variant: TExpandableCellVariant;
  onExpand: () => void;
  children: ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "group/expandable-cell flex w-full min-w-0 items-start gap-1 rounded-md border transition-colors duration-150 motion-reduce:transition-none",
        SHELL_CLASS[variant]
      )}
    >
      {children}
      <button
        type="button"
        onClick={onExpand}
        title={t("requirement_grid.data.expand_rich_text")}
        className="mt-0.5 shrink-0 rounded-sm text-tertiary opacity-0 transition-opacity outline-none group-focus-within/expandable-cell:opacity-100 group-hover/expandable-cell:opacity-100 hover:text-primary focus-visible:opacity-100"
      >
        <Maximize2 className="size-3.5" />
      </button>
    </div>
  );
};

/** 展开后的编辑弹窗。内容由调用方给：富文本放完整编辑器，单行文本放大文本框 */
export const ExpandableCellModal = ({
  open,
  label,
  onCancel,
  onOk,
  children,
}: {
  open: boolean;
  /** 弹窗标题里的字段名 */
  label: string;
  onCancel: () => void;
  onOk: () => void;
  children: ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      title={t("requirement_grid.data.edit_rich_text", { field: label })}
      onCancel={onCancel}
      onOk={onOk}
      okText={t("confirm")}
      cancelText={t("cancel")}
      width={720}
      modalRender={(modal) => <div data-prevent-outside-click>{modal}</div>}
      destroyOnHidden
    >
      {children}
    </Modal>
  );
};
