/**
 * 需求明细网格的可复用件。
 *
 * 编辑态网格（requirement-grid.tsx）、变更 diff 网格和版本只读快照共用同一套
 * 二级表头结构、值渲染和行内子表单排布逻辑，所以这些纯 helper 与展示组件抽在这里。
 */
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { observer } from "mobx-react";
import { Check, Download, File, Paperclip } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Modal, Typography } from "antd";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirementAssetRef,
  TRequirementData,
  TRequirementValue,
  TRequirementField,
  TRequirementFormRow,
} from "@plane/types";
import { Avatar, Checkbox, CustomSelect, MultiSelectDropdown, ToggleSwitch } from "@plane/ui";
import type { TDropdownOption } from "@plane/ui";
import { cn, getEditorAssetDownloadSrc, getEditorAssetSrc, getFileURL, stripAndTruncateHTML } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useMember } from "@/hooks/store/use-member";
import {
  RequirementRichTextCell,
  RequirementRichTextEditor,
  RequirementRichTextValue,
} from "./requirement-rich-text";
import { getRequirementSelectLabel, getRequirementSelectMode, getRequirementSelectOptions } from "./requirement-select";
import { RequirementTextCell } from "./requirement-text-cell";

export const getFormRows = (data: TRequirementData, fieldId: string): TRequirementFormRow[] => {
  const value = data[fieldId];
  return Array.isArray(value) ? (value as TRequirementFormRow[]) : [];
};

export const getMaxFormRows = (data: TRequirementData, formFields: TRequirementField[]) =>
  formFields.reduce((max, field) => Math.max(max, getFormRows(data, field.id).length), 0);

/**
 * Number of table columns a repeatable form occupies: one per visible child, plus a leading row
 * number column and a trailing action gutter.
 */
export const getFormColumnCount = (form: TRequirementField, withGutter: boolean, withRowNumber = false) =>
  form.children.length ? form.children.length + (withGutter ? 1 : 0) + (withRowNumber ? 1 : 0) : 1;

export const getRequirementRowKey = (
  rowKey: string,
  data: TRequirementData,
  formFields: TRequirementField[],
  rowPosition: number
) =>
  `${rowKey}-${
    formFields
      .map((form) => getFormRows(data, form.id)[rowPosition]?.id)
      .filter(Boolean)
      .join("-") || "root"
  }`;

export const isEmptyRequirementValue = (value: TRequirementValue | undefined) =>
  value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

export const getCursorPageOffset = (cursor?: string) => {
  if (!cursor) return null;
  const offset = Number(cursor.split(":")[1]);
  return Number.isFinite(offset) ? offset : null;
};

export const getCurrentPageOffset = (
  prevCursor: string | undefined,
  nextCursor: string | undefined,
  prevPageResults?: boolean,
  nextPageResults?: boolean
) => {
  const prevOffset = prevPageResults ? getCursorPageOffset(prevCursor) : null;
  if (prevOffset !== null) return prevOffset + 1;
  const nextOffset = getCursorPageOffset(nextCursor);
  if (nextOffset !== null && (nextPageResults || nextOffset > 0)) return Math.max(0, nextOffset - 1);
  return 0;
};

/** 行操作菜单里的一行：图标 + 文案，危险动作转红。编辑态网格与默认视图共用。 */
export const MenuRowLabel = ({
  icon: Icon,
  label,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  tone?: "default" | "danger";
}) => (
  <span className={cn("flex items-center gap-2", tone === "danger" && "text-danger-primary")}>
    <Icon className="size-3.5 shrink-0" />
    <span className="truncate">{label}</span>
  </span>
);

export const ChangedFieldCorner = () => (
  <span
    aria-hidden
    className="pointer-events-none absolute top-0 right-0 block h-0 w-0 border-t-[8px] border-l-[8px] border-t-accent-strong border-l-transparent"
  />
);

/** 成员 ID -> 头像 + 昵称。自定义的 member 字段与内置的负责人列共用 */
export const RequirementMemberValue = observer(function RequirementMemberValue({ value }: { value: unknown }) {
  const { getUserDetails } = useMember();
  if (typeof value !== "string") return null;
  const member = getUserDetails(value);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <Avatar
        size="sm"
        name={member?.display_name ?? value}
        src={getFileURL(member?.avatar_url ?? "")}
        showTooltip={false}
      />
      <span className="max-w-28 truncate text-primary">{member?.display_name ?? value}</span>
    </span>
  );
});

const RequirementImageValue = ({
  assets,
  workspaceSlug,
  className,
}: {
  assets: TRequirementAssetRef[];
  workspaceSlug: string;
  className?: string;
}) => {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<{ src: string; downloadSrc: string; name: string } | null>(null);

  return (
    <>
      <span className="flex max-w-64 flex-wrap gap-1.5">
        {assets.map((asset) => {
          const src = getEditorAssetSrc({ assetId: asset.asset_id, workspaceSlug });
          const downloadSrc = getEditorAssetDownloadSrc({ assetId: asset.asset_id, workspaceSlug });
          return (
            <button
              key={asset.asset_id}
              type="button"
              title={asset.name}
              onClick={() => {
                if (!src || !downloadSrc) return;
                setPreview({ src, downloadSrc, name: asset.name });
              }}
              className={cn(
                "block size-12 shrink-0 overflow-hidden rounded-md border border-subtle bg-layer-2 transition-opacity hover:opacity-90",
                className
              )}
            >
              <img src={src} alt={asset.name} className="size-full object-cover" loading="lazy" />
            </button>
          );
        })}
      </span>
      <Modal
        open={Boolean(preview)}
        onCancel={() => setPreview(null)}
        afterOpenChange={(visible) => {
          if (!visible) setPreview(null);
        }}
        footer={null}
        modalRender={(modal) => <div data-prevent-outside-click>{modal}</div>}
        width="100vw"
        style={{ top: 0, paddingBottom: 0 }}
        styles={{ body: { padding: 0 } }}
        destroyOnHidden
        title={
          <div className="flex items-center justify-between gap-3 pr-8" style={{ marginTop: -16, marginBottom: -16 }}>
            <Typography.Text strong className="min-w-0 truncate">
              {preview?.name ?? t("requirement_fields.field_types.image")}
            </Typography.Text>
            {preview?.downloadSrc && (
              <a
                href={preview.downloadSrc}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex shrink-0 items-center gap-1 text-13 font-medium text-accent-primary hover:text-accent-primary"
              >
                <Download className="size-3.5" />
                {t("page_navigation_pane.tabs.assets.download_button")}
              </a>
            )}
          </div>
        }
      >
        <div
          className="flex items-center justify-center overflow-auto bg-surface-2 p-4"
          style={{ height: "calc(100vh - 56px)" }}
        >
          {preview?.src && preview.downloadSrc && (
            <a
              href={preview.downloadSrc}
              target="_blank"
              rel="noreferrer noopener"
              title={t("page_navigation_pane.tabs.assets.download_button")}
              className="inline-flex max-h-full max-w-full"
            >
              <img
                src={preview.src}
                alt={preview.name}
                className="max-h-full max-w-full cursor-zoom-in object-contain"
              />
            </a>
          )}
        </div>
      </Modal>
    </>
  );
};

export const LeafValue = ({
  field,
  value,
  workspaceSlug,
  className,
  variant = "grid",
}: {
  field: TRequirementField;
  value: TRequirementValue | undefined;
  workspaceSlug: string;
  /** diff 网格用它给旧值套删除线、给新值套绿色 */
  className?: string;
  /**
   * detail 才把富文本渲染成真实排版：网格、diff、基线快照要的是密度与着色，
   * 富文本容器会同时毁掉这两样。
   */
  variant?: "grid" | "detail" | "modal";
}) => {
  const { t } = useTranslation();
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return null;
  if (field.field_type === "boolean") {
    return (
      <span
        className={cn(
          value
            ? "inline-flex rounded-md bg-success-subtle px-2 py-0.5 text-13 text-success-primary"
            : "inline-flex rounded-md bg-layer-2 px-2 py-0.5 text-13 text-secondary",
          className
        )}
      >
        {t(value ? "requirement_grid.data.yes" : "requirement_grid.data.no")}
      </span>
    );
  }
  if (field.field_type === "select") {
    const selectedIds = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [value];
    const selectedOptions = selectedIds
      .map((optionId) => ({
        id: String(optionId),
        label: getRequirementSelectLabel(field, String(optionId)),
      }))
      .filter((option): option is { id: string; label: string } => Boolean(option.label));
    if (!selectedOptions.length) return null;
    return (
      <span className="flex max-w-64 flex-wrap gap-1">
        {selectedOptions.map((option) => (
          <span
            key={option.id}
            className={cn(
              "inline-flex max-w-44 items-center truncate rounded-md border border-subtle bg-layer-2 px-2 py-0.5 text-13 text-primary",
              className
            )}
          >
            {option.label}
          </span>
        ))}
      </span>
    );
  }
  if (field.field_type === "member") return <RequirementMemberValue value={value} />;
  if (field.field_type === "attachment" || field.field_type === "image") {
    const assets = Array.isArray(value) ? (value as TRequirementAssetRef[]) : [];
    if (!assets.length) return null;
    if (field.field_type === "image") {
      return <RequirementImageValue assets={assets} workspaceSlug={workspaceSlug} className={className} />;
    }
    return (
      <span className="flex max-w-48 flex-wrap gap-1">
        {assets.map((asset) => (
          <a
            key={asset.asset_id}
            href={getEditorAssetDownloadSrc({
              assetId: asset.asset_id,
              workspaceSlug,
            })}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              "inline-flex max-w-44 items-center gap-1 rounded-md bg-layer-2 px-1.5 py-1 text-13 text-primary hover:text-accent-primary",
              className
            )}
          >
            <File className="size-3" />
            <span className="truncate">{asset.name}</span>
          </a>
        ))}
      </span>
    );
  }
  if (field.field_type === "rich_text" && variant === "detail") {
    return (
      <RequirementRichTextValue
        workspaceSlug={workspaceSlug}
        editorId={`requirement-field-${field.id}`}
        value={String(value)}
        containerClassName={cn("!pl-0 border-none text-13", className)}
      />
    );
  }
  const text = field.field_type === "rich_text" ? stripAndTruncateHTML(String(value), 180) : String(value);
  // 网格列宽只有 144px：必须截断。detail 才允许折行看全。
  return (
    <span
      title={variant === "detail" ? undefined : text}
      className={cn(
        "block text-13 leading-5 text-primary",
        variant === "detail" ? "max-w-full whitespace-pre-wrap" : "w-full min-w-0 truncate",
        className
      )}
    >
      {text}
    </span>
  );
};

/* ---------------------------------------------------------------------------
 * 表格外壳：与工作项电子表格（issues/issue-layouts/spreadsheet）同一套量化。
 *
 * 三个需求网格（默认视图 / 类型视图 / 变更 diff）此前各写一套表头与单元格样式，
 * 攒出来的问题是：每格都画竖线（Excel 观感）、表头与正文同色只靠边框分隔、行高被
 * 审批列的两行布局单独撑高，以及列宽写死后总和超出容器，最右边的列开箱就在屏幕外。
 *
 * 这里照抄工作项那套的量化，三处共用：
 * - 属性列一律 144px，标题列吃掉剩余宽度 —— 表格恒好铺满容器，右侧不留死白
 * - 标题列 sticky 左固定，横滚时始终知道自己在看哪一行
 * - 行高 44px（h-11），表头等高
 * - 只留竖线；横线由单元格自己的 border-b 给
 * - 表头 = 图标 + 列名，text-13 text-secondary（正文是 text-primary，拉开层级）
 * --------------------------------------------------------------------------- */

/** 属性列宽。与 spreadsheet-table.tsx 的 PROPERTY_COLUMN_WIDTH 对齐 */
export const REQUIREMENT_GRID_COLUMN_WIDTH = 144;

/**
 * 勾选叠在首列上，不占独立格子。和工作项电子表格同一套路：
 * absolute left-1，默认隐身，行/表头 hover 或已选中才显形。
 * 宿主列用 REQUIREMENT_GRID_SELECT_HOST_PAD_CLASS，避免文字贴上复选框。
 */
export const REQUIREMENT_GRID_SELECT_HOST_PAD_CLASS = "pr-page-x pl-10";

export const RequirementGridHoverSelect = ({
  checked,
  onChange,
  ariaLabel,
  hoverGroup,
  indeterminate,
  disabled,
  forceVisible = false,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  hoverGroup: "header" | "requirement";
  indeterminate?: boolean;
  disabled?: boolean;
  forceVisible?: boolean;
}) => (
  <div
    className="absolute inset-y-0 left-1 z-[1] grid w-3.5 place-items-center"
    onClick={(event) => event.stopPropagation()}
  >
    <Checkbox
      className="size-3.5 !outline-none"
      iconClassName="size-3"
      checked={checked}
      indeterminate={indeterminate}
      disabled={disabled}
      onChange={onChange}
      aria-label={ariaLabel}
      containerClassName={cn(
        "pointer-events-none opacity-0 transition-opacity",
        hoverGroup === "header" && "group-hover/header:pointer-events-auto group-hover/header:opacity-100",
        hoverGroup === "requirement" && "group-hover/requirement:pointer-events-auto group-hover/requirement:opacity-100",
        (forceVisible || checked) && "pointer-events-auto opacity-100"
      )}
    />
  </div>
);

/**
 * 描述列例外地宽一档。它装的是富文本摘要，144px 下基本只能看到前几个字；
 * 工作项表格没有这一列，所以这里没有可抄的量。
 */
export const REQUIREMENT_GRID_DESCRIPTION_COLUMN_WIDTH = 216;

/** 标题列的下限。窄容器下宁可整表横滚，也不要把标题压到读不出来 */
export const REQUIREMENT_GRID_TITLE_MIN_WIDTH = 280;

/**
 * 子表单每组末尾那道操作沟槽：末行装「+ 新增子行」与「…」菜单，其余行只装「…」。
 * 56px 刚好并排放下两个 size-6 按钮 —— 「新增子行」原先独占一整行，那条按钮行
 * 让每条需求恒定多出 44px 高，用 20px 的横向宽度换掉它是划算的。
 */
export const FORM_GUTTER_COLUMN_WIDTH = 56;

/**
 * 子表单每组开头那列行号。照着测试用例详情的「测试步骤」表：编号本身就是拖拽把手。
 * 32px 装得下三位数加两侧 px-1，不参与列宽拖拽。
 */
export const FORM_ROW_NUMBER_COLUMN_WIDTH = 48;

/** border-collapse 下最右侧单元格的外边框会多撑出约 1px，自动填充时要预留 */
const COLLAPSED_BORDER_WIDTH = 1;

export const getRequirementColumnWidth = (columnKey: string) =>
  columnKey === "description_html" ? REQUIREMENT_GRID_DESCRIPTION_COLUMN_WIDTH : REQUIREMENT_GRID_COLUMN_WIDTH;

/**
 * 标题列宽 = max(下限, 容器宽 - 其余列宽之和)。
 *
 * 这是工作项表格「不留右侧空白」的全部机关：其余列都是定宽，唯独第一列弹性，
 * 于是表格总宽恒 >= 容器宽，既不会短一截露出背景，也不会因为定宽相加超出而
 * 把每列压扁。
 */
export const resolveRequirementTitleColumnWidth = (containerWidth: number, otherColumnsWidth: number) =>
  Math.max(REQUIREMENT_GRID_TITLE_MIN_WIDTH, Math.floor(containerWidth - otherColumnsWidth - COLLAPSED_BORDER_WIDTH));

/** 用户拖窄标题列的下限。自动撑开时仍走 REQUIREMENT_GRID_TITLE_MIN_WIDTH */
export const REQUIREMENT_GRID_RESIZE_TITLE_MIN_WIDTH = 160;
/** 其它数据列拖窄下限 */
export const REQUIREMENT_GRID_RESIZE_COLUMN_MIN_WIDTH = 80;

export type TRequirementGridColumnWidths = Record<string, number>;

export const getRequirementResizeMinWidth = (key: string) =>
  key === "title" ? REQUIREMENT_GRID_RESIZE_TITLE_MIN_WIDTH : REQUIREMENT_GRID_RESIZE_COLUMN_MIN_WIDTH;

/**
 * 列宽拖拽。默认用调用方算好的宽度；第一次拖任何列时把当时的 snapshot 钉死，
 * 之后只改被拖的那一列。不写 localStorage，组件卸载即回默认。
 */
export const useRequirementGridColumnResize = () => {
  const [overrides, setOverrides] = useState<TRequirementGridColumnWidths | null>(null);
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  const getWidth = useCallback(
    (key: string, defaultWidth: number) => overrides?.[key] ?? defaultWidth,
    [overrides]
  );

  const startResize = useCallback(
    (key: string, snapshot: TRequirementGridColumnWidths, event: ReactMouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const base = { ...(overridesRef.current ?? snapshot) };
      const startWidth = base[key] ?? snapshot[key];
      if (startWidth === undefined) return;

      const minWidth = getRequirementResizeMinWidth(key);
      const originalCursor = document.body.style.cursor;
      const originalUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        setOverrides({
          ...base,
          [key]: Math.max(minWidth, Math.round(startWidth + (moveEvent.clientX - startX))),
        });
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = originalCursor;
        document.body.style.userSelect = originalUserSelect;
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    []
  );

  return { getWidth, startResize };
};

export const RequirementGridColumnResizer = ({
  onMouseDown,
}: {
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) => (
  <div
    className="absolute top-0 right-0 z-[1] h-full w-2 cursor-col-resize"
    onMouseDown={onMouseDown}
    role="presentation"
  >
    <div className="absolute top-0 right-0 h-full w-px bg-transparent transition-colors group-hover/header:bg-accent-primary/50" />
  </div>
);

/**
 * 表头单元格。不画上下边框 —— 底线由 thead 统一给一条，免得和行分隔线叠成双线。
 * FLUSH 版不带内边距，留给自己要铺满整格底色的单元格（左固定的标题列就是）。
 */
const HEADER_CELL_BASE =
  "group/header relative h-11 border-r border-strong bg-layer-1 text-left align-middle text-13 font-medium";
export const REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS = HEADER_CELL_BASE;
export const REQUIREMENT_GRID_HEADER_CELL_CLASS = `${HEADER_CELL_BASE} px-page-x`;

/**
 * 正文单元格。横线走 border-b，竖线走 border-r，与工作项一致。
 *
 * 三档：
 * - BORDER：只有边框与字号，不定高也不带内边距。diff 网格用它 —— 那里的单元格是
 *   新旧值上下并排，钉死 44px 会把下半截切掉，且它自己有疏密切换。
 * - FLUSH：定高不带内边距，留给要自己铺满整格底色的单元格（左固定的标题列）。
 * - 默认：定高 + 内边距，绝大多数格子用这个。
 */
// overflow-hidden：定宽列（table-fixed + 144px）里长串文本不能溢出盖到下一列
const CELL_BORDER_BASE = "overflow-hidden border-r border-b border-subtle align-middle text-13 text-primary";
export const REQUIREMENT_GRID_CELL_BORDER_CLASS = CELL_BORDER_BASE;
export const REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS = `${CELL_BORDER_BASE} h-11`;
export const REQUIREMENT_GRID_BODY_CELL_CLASS = `${CELL_BORDER_BASE} h-11 px-page-x`;

/**
 * FLUSH 格子里「不该铺满」的内容自己补回内边距：只读值、开关、附件上传这类不是输入框的
 * 东西贴着格线反而难看。可编辑的输入控件走 FIELD_INPUT_CLASS.grid 那套铺满配方。
 *
 * 保持块级、不定高：垂直居中交给 td 的 align-middle，跟没拆内层 div 之前一个样；换成
 * flex + h-full 反而会让内层 truncate 的 span 变成不肯收缩的 flex item，长文本溢出去。
 *
 * 注意不能靠 cn() 往 REQUIREMENT_GRID_BODY_CELL_CLASS 后面补 px 来退回内边距 ——
 * twMerge 认不出 px-page-x 属于 px 组，盖不住（同 requirement-grid 里编号格那处注释）。
 */
export const REQUIREMENT_GRID_CELL_PAD_CLASS = "min-w-0 px-page-x";

/**
 * 可编辑格子的整格反馈：hover 底色与焦点描边画在格子（td）上，不画在控件上。
 *
 * 控件是 44px 定高，而带子表单行的需求会让内置列与根字段列 rowSpan 横跨好几行，格子
 * 高出好几倍 —— 状态画在控件上时就只占中间一截，上下够不着格线，露出两条空白。格子
 * 本身永远就是那个矩形，画在它身上天然铺满，控件多高都不用管。
 * 焦点靠 focus-within 冒上来：真正接收焦点的是里面的 input 或下拉按钮。
 *
 * 主信号是底色（hover 上灰、聚焦转白），描边只把「就是这一格」点出来，所以压到 1px
 * 并降透明度 —— 一屏十来列的密集表格里，2px 实心品牌蓝太抢。
 *
 * 用 accent-strong/60 而不是 accent-subtle：描边色只有 accent-strong 与 accent-subtle
 * 两档，而 accent-subtle 是 brand-300（浅色主题下 oklch 亮度 0.94，近乎白），1px 画在
 * 聚焦转白的底色上等于没画。降透明度才能同时做到「淡」和「看得见」。
 *
 * 颜色不能写 accent-primary：它只在 background-color / text-color / stroke / fill 四个
 * 命名空间里有定义，没有 --ring-color-accent-primary。写了不报错，但 --tw-ring-color
 * 会落回 currentcolor，描边渲染成近黑色。
 */
export const REQUIREMENT_GRID_CELL_EDITABLE_CLASS =
  "hover:bg-layer-1 focus-within:bg-surface-1 focus-within:ring-1 focus-within:ring-accent-strong/60 focus-within:ring-inset";

/** 左固定列。z 值要压过普通单元格，否则横滚时被盖住 */
export const REQUIREMENT_GRID_STICKY_HEADER_CLASS = "left-0 z-[15] md:sticky";
export const REQUIREMENT_GRID_STICKY_BODY_CLASS = "left-0 z-10 bg-surface-1 md:sticky";

/** 行底色。选中 / 悬停都不能撞上表头的 bg-layer-1，否则 sticky 表头会和行糊在一起 */
export const REQUIREMENT_GRID_ROW_CLASS =
  "bg-surface-1 transition-colors duration-150 hover:bg-layer-transparent-hover motion-reduce:transition-none";
export const REQUIREMENT_GRID_ROW_SELECTED_CLASS = "bg-accent-primary/5 hover:bg-accent-primary/10";

/**
 * 表头里的「图标 + 列名」。
 *
 * 内置列的图标本来就定义在 REQUIREMENT_BUILTIN_COLUMNS 上（Type / AlignLeft /
 * CircleDot …），只是一直没被表头用上；自定义字段没有图标，留空即可。
 */
export const RequirementGridHeaderLabel = ({
  icon: Icon,
  label,
  isRequired,
}: {
  icon?: LucideIcon;
  label: string;
  isRequired?: boolean;
}) => (
  <span className="flex w-full min-w-0 items-center gap-1.5 text-13 font-medium text-secondary">
    {Icon && <Icon className="size-4 shrink-0 text-placeholder" />}
    <span className="truncate">{label}</span>
    {isRequired && <span className="shrink-0 text-danger-primary">*</span>}
  </span>
);

/**
 * 表格滚动容器的挂钩：给出一个 ref 回调，外加容器宽度与左固定列的滚动投影。
 *
 * 用「回调 ref 存进 state」而不是 useRef —— 三个网格都会在加载态提前 return，
 * 滚动容器要等数据回来才挂载。ref 对象在那之前一直是 null，而依赖它的 effect
 * 又不会因为 ref.current 变了重跑，监听器就永远接不上。state 才会触发重跑。
 */
export const useRequirementGridScrollContainer = () => {
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const isScrolled = useRef(false);

  // 容器宽度：标题列要吃掉剩余宽度，就得知道容器有多宽。
  // 与 spreadsheet-table.tsx 同款 ResizeObserver + resize 兜底。
  useEffect(() => {
    if (!scrollContainer) return;

    const updateWidth = () => setContainerWidth(scrollContainer.clientWidth);
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(scrollContainer);
    return () => observer.disconnect();
  }, [scrollContainer]);

  /**
   * 横滚时给左固定列打一道投影，暗示右边还有内容被压在下面。
   *
   * 直接改 DOM style 而不是走 state —— 与工作项同理：滚动一像素就重渲染整张表
   * 的代价太大，而这里要改的只是若干个单元格的 box-shadow。
   */
  useEffect(() => {
    if (!scrollContainer) return;

    const handleScroll = () => {
      const hasScrolled = scrollContainer.scrollLeft > 0;
      if (hasScrolled === isScrolled.current) return;
      isScrolled.current = hasScrolled;

      scrollContainer.querySelectorAll<HTMLElement>("[data-requirement-sticky-cell]").forEach((cell) => {
        cell.style.boxShadow = hasScrolled
          ? cell.tagName === "TH"
            ? "8px -22px 22px 10px rgba(0, 0, 0, 0.05)"
            : "8px 22px 22px 10px rgba(0, 0, 0, 0.05)"
          : "none";
      });
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [scrollContainer]);

  return { setScrollContainer, containerWidth };
};

/**
 * 二级表头：非表单根字段 rowSpan=2，表单字段作分组表头、子字段排在第二行。
 * 首列与末列由调用方给（编辑态给编号等左固定列与「操作」，diff 模式给「变更」且没有末列）。
 */
type TRequirementGridBuiltinHeader = {
  key: string;
  className?: string;
  content: React.ReactNode;
  onResize?: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

/** 统一列流里的一列：内置属性列或自定义根字段，顺序由调用方按类型布局归并好 */
export type TRequirementGridOrderedColumn =
  | { kind: "builtin"; header: TRequirementGridBuiltinHeader }
  | { kind: "field"; field: TRequirementField };

export const RequirementGridHeader = ({
  rootFields,
  showActionGutter,
  showFormRowNumber = false,
  leadingHeader,
  leadingHeaders,
  builtinHeaders,
  orderedColumns,
  extraHeaders,
  trailingHeader,
  onFieldResize,
}: {
  rootFields: TRequirementField[];
  showActionGutter: boolean;
  /**
   * 子表单每组开头是否留一列行号（它同时是拖拽把手）。
   * 刻意与 showActionGutter 分开：变更 diff 网格也开着沟槽（借那道格子放增删改标记），
   * 但它的表体没有行号格，跟着长一列就会整片错位。
   */
  showFormRowNumber?: boolean;
  /** 首列。stickyCell 让它参与左固定列的滚动投影（见 useRequirementGridScrollContainer） */
  leadingHeader?: {
    className: string;
    content: React.ReactNode;
    style?: React.CSSProperties;
    stickyCell?: boolean;
    onResize?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  };
  /** 多列左固定（编号 + 标题）。有它时优先于 leadingHeader */
  leadingHeaders?: {
    key: string;
    className: string;
    content: React.ReactNode;
    style?: React.CSSProperties;
    stickyCell?: boolean;
    onResize?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  }[];
  /**
   * 结构性单列表头（来源编号、审批态这类不参与布局排序的列），恒排在统一列流之前。
   * 内置列永远是单列，不参与表单字段的二级表头跨列逻辑，所以只跟着 spanRows 走。
   */
  builtinHeaders?: TRequirementGridBuiltinHeader[];
  /**
   * 统一列流：内置属性列与自定义字段列按类型布局交叉排序。提供时替代 rootFields
   * 的第一行渲染，二级表头的表单对位也按它的顺序取。不提供则保持旧行为
   * （builtinHeaders 全在前、rootFields 在后）。
   */
  orderedColumns?: TRequirementGridOrderedColumn[];
  /** 字段列之后、操作列之前的附加列（产品需求的「变更 / 最后变更于」） */
  extraHeaders?: {
    key: string;
    className: string;
    content: React.ReactNode;
    onResize?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  }[];
  trailingHeader?: { className: string; content: React.ReactNode };
  /** 自定义字段 / 表单子字段的列宽拖拽。分组表头和操作沟槽不走这里 */
  onFieldResize?: (fieldId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
}) => {
  const { t } = useTranslation();
  const orderedRootFields = orderedColumns
    ? orderedColumns.flatMap((column) => (column.kind === "field" ? [column.field] : []))
    : rootFields;
  const formFields = orderedRootFields.filter((field) => field.field_type === "form");
  const hasFormFields = formFields.length > 0;
  const spanRows = hasFormFields ? 2 : 1;
  const resolvedLeadingHeaders =
    leadingHeaders ??
    (leadingHeader ? [{ key: "leading", ...leadingHeader }] : []);

  const renderBuiltinHeader = (header: TRequirementGridBuiltinHeader) => (
    <th
      key={header.key}
      rowSpan={spanRows}
      className={cn(REQUIREMENT_GRID_HEADER_CELL_CLASS, header.className)}
    >
      {header.content}
      {header.onResize && <RequirementGridColumnResizer onMouseDown={header.onResize} />}
    </th>
  );
  const renderFieldHeader = (field: TRequirementField) =>
    field.field_type === "form" ? (
      <th
        key={field.id}
        colSpan={getFormColumnCount(field, showActionGutter, showFormRowNumber)}
        className={cn(REQUIREMENT_GRID_HEADER_CELL_CLASS, "border-b border-strong text-center")}
      >
        <span className="truncate text-13 font-medium text-secondary">{field.name}</span>
      </th>
    ) : (
      <th key={field.id} rowSpan={spanRows} className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
        <RequirementGridHeaderLabel label={field.name} isRequired={field.is_required} />
        {onFieldResize && (
          <RequirementGridColumnResizer onMouseDown={(event) => onFieldResize(field.id, event)} />
        )}
      </th>
    );

  return (
    <thead className="sticky top-0 z-[12] border-b border-strong text-13 font-medium">
      <tr>
        {resolvedLeadingHeaders.map((header) => (
          <th
            key={header.key}
            rowSpan={spanRows}
            className={header.className}
            style={header.style}
            data-requirement-sticky-cell={header.stickyCell ? "" : undefined}
          >
            {header.content}
            {header.onResize && <RequirementGridColumnResizer onMouseDown={header.onResize} />}
          </th>
        ))}
        {builtinHeaders?.map(renderBuiltinHeader)}
        {orderedColumns
          ? orderedColumns.map((column) =>
              column.kind === "builtin" ? renderBuiltinHeader(column.header) : renderFieldHeader(column.field)
            )
          : rootFields.map(renderFieldHeader)}
        {extraHeaders?.map((header) => (
          <th key={header.key} rowSpan={spanRows} className={header.className}>
            {header.content}
            {header.onResize && <RequirementGridColumnResizer onMouseDown={header.onResize} />}
          </th>
        ))}
        {trailingHeader && (
          <th rowSpan={spanRows} className={trailingHeader.className}>
            {trailingHeader.content}
          </th>
        )}
      </tr>
      {hasFormFields && (
        <tr>
          {formFields.map((field) =>
            field.children.length ? (
              <Fragment key={field.id}>
                {showFormRowNumber && (
                  <th
                    className={cn(
                      REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS,
                      "px-1 text-center font-medium text-secondary"
                    )}
                  >
                    {t("requirement_grid.data.row_number")}
                  </th>
                )}
                {field.children.map((child) => (
                  <th
                    key={child.id}
                    className={cn(REQUIREMENT_GRID_HEADER_CELL_CLASS, "font-normal")}
                  >
                    <RequirementGridHeaderLabel label={child.name} isRequired={child.is_required} />
                    {onFieldResize && (
                      <RequirementGridColumnResizer onMouseDown={(event) => onFieldResize(child.id, event)} />
                    )}
                  </th>
                ))}
                {showActionGutter && (
                  <th aria-hidden className={cn(REQUIREMENT_GRID_HEADER_CELL_CLASS, "px-0.5")} />
                )}
              </Fragment>
            ) : (
              <th
                key={`${field.id}-empty`}
                className={cn(REQUIREMENT_GRID_HEADER_CELL_CLASS, "font-normal text-placeholder")}
              >
                {t("requirement_fields.fields.no_children")}
              </th>
            )
          )}
        </tr>
      )}
    </thead>
  );
};

/**
 * 字段控件的两套底色配方。内置字段（BuiltinCellEditor）也从这里取，免得两边漂移。
 *
 * 两套现在都是静息无底色，只在 hover / focus 时显形。
 *
 * grid 铺满整格：控件自己吃掉 44px 行高和 px-page-x 的左右内边距，格子（td）改用
 * REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS 不带内边距。这样文字贴着格线排，不再是一个
 * 浮在格子中间、四周围一圈空白的圆角小方框 —— 那既浪费了 160px 列宽里 43px 的横向
 * 空间，格线与方框两套矩形也互相打架。与工作项电子表格同一套（见 issue-layouts/
 * spreadsheet 的 issue-column.tsx：td 不带 padding，列组件自己铺满 + px-page-x）。
 * 注意 grid 这套只管排版，hover 底色与焦点描边归格子管（见
 * REQUIREMENT_GRID_CELL_EDITABLE_CLASS）—— 控件定高，rowSpan 撑高的格子里画不满。
 * detail：标签已经把可编辑性说清楚了，再铺一层底色就是噪音 —— 与工作项详情侧栏
 * 对齐（见 issues/issue-detail/sidebar.tsx，全部 transparent-with-text，静息无底色）。
 */
export const FIELD_INPUT_CLASS = {
  grid: "h-11 w-full min-w-0 rounded-none border-0 bg-transparent px-page-x text-14 text-primary outline-none placeholder:text-placeholder",
  detail:
    "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-14 text-primary transition-colors duration-150 outline-none placeholder:text-placeholder hover:bg-layer-transparent-hover focus:border-accent-primary focus:bg-surface-1 motion-reduce:transition-none",
  // 建行弹窗：与工作项 ExtraFieldControl（compact=false）同皮 —— Input/下拉都是
  // border-subtle-1 + bg-layer-2，不要再铺一层更硬的 border-subtle / surface-1。
  modal:
    "h-[38px] w-full min-w-0 rounded-md border-[0.5px] border-subtle-1 bg-layer-2 px-3 py-2 text-13 text-primary outline-none placeholder:text-tertiary focus:border-accent-primary motion-reduce:transition-none",
} as const;

/**
 * 建行弹窗曾用过的无边框大标题样式。标题已改用 @plane/ui Input（与工作项一致），
 * 仍导出以免其它入口误用旧常量时报找不到。
 */
export const FIELD_HEADLINE_INPUT_CLASS =
  "h-auto w-full min-w-0 border-none bg-transparent p-0 text-18 leading-7 font-medium text-primary outline-none placeholder:font-normal placeholder:text-placeholder";

/** 下拉按钮版：要用 ! 盖掉 @plane/ui 自带的边框 */
export const FIELD_DROPDOWN_CLASS = {
  grid: "h-11 w-full min-w-0 rounded-none !border-0 bg-transparent px-page-x",
  compact:
    "h-8 w-full min-w-0 border !border-transparent bg-transparent px-2 transition-colors duration-150 hover:!border-subtle hover:bg-layer-1 focus:!border-accent-primary focus:bg-surface-1 motion-reduce:transition-none",
  detail:
    "h-8 w-full min-w-0 border !border-transparent bg-transparent px-2 transition-colors duration-150 hover:bg-layer-transparent-hover focus:!border-accent-primary focus:bg-surface-1 motion-reduce:transition-none",
  modal:
    "h-[38px] w-full min-w-0 border-[0.5px] !border-subtle-1 bg-layer-2 px-3 transition-colors duration-150 hover:!border-strong focus:!border-accent-primary motion-reduce:transition-none",
} as const;

/** MultiSelectDropdown 走 buttonContainerClassName，没有 ! 之争。原生 button 默认居中，必须显式 text-left。 */
const MULTI_SELECT_CLASS = {
  grid: "flex h-11 w-full min-w-0 items-center rounded-none border-0 bg-transparent px-page-x text-left",
  compact:
    "flex h-8 w-full min-w-0 items-center rounded-md border border-transparent bg-transparent px-2 text-left transition-colors duration-150 hover:border-subtle hover:bg-layer-1 focus:border-accent-primary focus:bg-surface-1 motion-reduce:transition-none",
  detail:
    "flex h-8 w-full min-w-0 items-center rounded-md border border-transparent bg-transparent px-2 text-left transition-colors duration-150 hover:bg-layer-transparent-hover focus:border-accent-primary focus:bg-surface-1 motion-reduce:transition-none",
  modal:
    "flex h-[38px] w-full min-w-0 items-center rounded-md border-[0.5px] border-subtle-1 bg-layer-2 px-3 text-left transition-colors duration-150 hover:border-strong focus:border-accent-primary motion-reduce:transition-none",
} as const;

/**
 * 单个自定义字段的编辑器。与内置列的 BuiltinCellEditor 并列，调用方按列来源二选一。
 *
 * 网格与需求详情共用同一份控件，改一次两处同时生效 —— 两边对同一个字段类型给出
 * 不同的输入方式，是这类表单最容易积累的不一致。
 */
export const LeafEditor = ({
  field,
  value,
  workspaceSlug,
  entityId,
  onChange,
  onUpload,
  onRemoveAsset,
  onAssetUpload,
  variant = "grid",
  deferTextCommit,
}: {
  field: TRequirementField;
  value: TRequirementValue | undefined;
  workspaceSlug: string;
  /** 富文本内联资源的归属实体：网格传产品/标准库 id，详情页传需求 id */
  entityId: string;
  onChange: (value: TRequirementValue) => void;
  onUpload: (file: globalThis.File, imageOnly: boolean) => Promise<TRequirementAssetRef>;
  onRemoveAsset?: (assetId: string) => void;
  /** 网格草稿把富文本里上传的资源登记为待提交，取消编辑时统一清理 */
  onAssetUpload?: (assetId: string) => void;
  /**
   * detail 直接内联完整编辑器；grid 只有 160px 列宽，简单内容内联改、复杂内容走弹窗。
   * compact 与 grid 同为表格单元格（同样有列头、同样走弹窗改长文本），只是宿主格子自带
   * 内边距、行更矮 —— 详情页里那张子表单小表就是它，控件在那儿不铺满。
   */
  variant?: "grid" | "compact" | "detail" | "modal";
  /**
   * 文本字段是否延后到失焦再提交。默认跟随 variant，但两者不是一回事：
   * 网格的 onChange 只写 draftRows（逐字符是对的，isDirty 要靠它），详情页与
   * 详情页里的子表单则是 onChange 即一次整行 PATCH，必须先落草稿。
   */
  deferTextCommit?: boolean;
}) => {
  const { t } = useTranslation();
  // 表格形态（grid / compact）头上就有列名，空值不必再写「请选择」这类占位提示
  const isTableCell = variant === "grid" || variant === "compact";
  if (field.field_type === "boolean") {
    // 撑到和其它编辑器一样的行高：裸开关只有 16px 高，夹在一排控件里会矮一截。
    // 开关不是输入框，铺满整格没有意义，grid 下自己补回格子的 px-page-x
    return (
      <div className={cn("flex min-w-0 items-center", variant === "grid" ? "h-11 px-page-x" : "h-8")}>
        <ToggleSwitch value={Boolean(value)} onChange={() => onChange(!value)} size="sm" />
      </div>
    );
  }
  if (field.field_type === "select") {
    const options = getRequirementSelectOptions(field);
    const placeholder = field.config.placeholder ?? t("requirement_grid.data.select_option");
    // 建行弹窗跟工作项 ExtraFieldControl（compact=false）走同一套下拉皮
    const isModal = variant === "modal";
    // 网格有列头，空值不必再写「请选择」；弹窗没有列头，才回落到占位文案
    const emptyLabel = isModal ? placeholder : "";
    if (getRequirementSelectMode(field) === "multiple") {
      const currentValue = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
      const dropdownOptions: TDropdownOption[] = options.map((option) => ({
        value: option.id,
        data: option,
      }));
      return (
        <MultiSelectDropdown
          containerClassName="w-full min-w-0"
          value={currentValue}
          onChange={(nextValue) => onChange(nextValue)}
          options={dropdownOptions}
          keyExtractor={(option) => option.value}
          renderItem={({ value: optionId, selected }) => (
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate text-13">
                {options.find((option) => option.id === optionId)?.label ?? optionId}
              </span>
              {selected && <Check className="size-3.5 shrink-0 text-accent-primary" />}
            </div>
          )}
          buttonContent={(_isOpen, selectedValue) => {
            const selectedIds = (selectedValue as string[] | undefined) ?? [];
            const labels = selectedIds
              .map((optionId) => options.find((option) => option.id === optionId)?.label)
              .filter(Boolean);
            const empty = labels.length === 0;
            return (
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-13",
                  empty ? (isModal ? "text-tertiary" : "text-placeholder") : "text-primary"
                )}
              >
                {empty ? emptyLabel : labels.join(", ")}
              </span>
            );
          }}
          buttonContainerClassName={
            isModal
              ? "w-full rounded border-[0.5px] border-strong px-3 py-2 text-left"
              : MULTI_SELECT_CLASS[variant]
          }
          optionsContainerClassName="w-60"
          disableSearch={options.length <= 8}
          disableSorting
        />
      );
    }

    const selectedId = typeof value === "string" ? value : null;
    const selectedOption = options.find((option) => option.id === selectedId);
    return (
      <CustomSelect
        value={selectedId}
        onChange={(nextValue: string | null) => onChange(nextValue)}
        label={
          <span
            className={cn(
              "min-w-0 truncate text-13",
              selectedOption ? "text-primary" : isModal ? "text-tertiary" : "text-placeholder"
            )}
          >
            {selectedOption?.label ?? emptyLabel}
          </span>
        }
        // modal 不盖自定义边框，沿用 CustomSelect input 默认皮（与 ExtraFieldControl 一致）
        buttonClassName={isModal ? "w-full" : FIELD_DROPDOWN_CLASS[variant]}
        optionsClassName="w-60"
        noChevron={!isModal && !selectedOption}
        input
      >
        {!field.is_required && (
          <CustomSelect.Option value={null}>
            <span className="text-13 text-secondary">{t("requirement_grid.data.clear_selection")}</span>
          </CustomSelect.Option>
        )}
        {options.map((option) => (
          <CustomSelect.Option key={option.id} value={option.id}>
            <span className="truncate text-13">{option.label}</span>
          </CustomSelect.Option>
        ))}
      </CustomSelect>
    );
  }
  if (field.field_type === "member") {
    return (
      <MemberDropdown
        multiple={false}
        value={typeof value === "string" ? value : null}
        onChange={(memberId) => onChange(memberId)}
        // 网格铺满整格后可编辑性交给 hover 底色，再画一圈按钮边框就又变回浮在格子里的小方框；
        // compact 的格子没铺满，仍靠边框告诉人这里能点
        buttonVariant={variant === "grid" || variant === "detail" ? "transparent-with-text" : "border-with-text"}
        // modal 高度/内边距与 ExtraFieldControl（compact=false）的 user 字段一致
        buttonClassName={
          variant === "modal"
            ? "!h-[38px] !w-full !rounded !px-3 !py-2 !text-13"
            : cn(FIELD_DROPDOWN_CLASS[variant], "text-14")
        }
        buttonContainerClassName="w-full min-w-0"
        // 网格有列头，空值不必再写「选择成员」；与上面选择器的 emptyLabel 同一口径
        placeholder={isTableCell ? "" : (field.config.placeholder ?? t("requirement_grid.data.select_member"))}
        showUserDetails
      />
    );
  }
  if (field.field_type === "attachment" || field.field_type === "image") {
    const assets = Array.isArray(value) ? (value as TRequirementAssetRef[]) : [];
    const removeAsset = (assetId: string) => {
      onRemoveAsset?.(assetId);
      onChange(assets.filter((item) => item.asset_id !== assetId));
    };
    // 附件是一叠卡片加一个上传区，不是输入框，铺满整格没有意义 —— grid 下补回格子内边距
    return (
      <div className={cn("flex w-full min-w-0 flex-col gap-1", variant === "grid" && "px-page-x py-1.5")}>
        {field.field_type === "image" ? (
          <div className="flex flex-wrap gap-1">
            {assets.map((asset) => {
              const src = getEditorAssetSrc({ assetId: asset.asset_id, workspaceSlug });
              return (
                <span
                  key={asset.asset_id}
                  title={asset.name}
                  className="relative size-9 shrink-0 overflow-hidden rounded-md border border-subtle bg-layer-2"
                >
                  <img src={src} alt={asset.name} className="size-full object-cover" loading="lazy" />
                  <button
                    type="button"
                    className="absolute top-0.5 right-0.5 grid size-3.5 place-items-center rounded-full bg-surface-1/90 text-10 leading-none text-secondary shadow-sm hover:bg-danger-subtle hover:text-danger-primary"
                    onClick={() => removeAsset(asset.asset_id)}
                    aria-label={t("delete")}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        ) : (
          assets.map((asset) => (
            <span
              key={asset.asset_id}
              className="flex min-w-0 items-center gap-1 rounded-md bg-layer-2 px-1.5 py-0.5 text-12"
            >
              <Paperclip className="size-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate" title={asset.name}>
                {asset.name}
              </span>
              <button
                type="button"
                className="shrink-0 text-secondary hover:text-danger-primary"
                onClick={() => removeAsset(asset.asset_id)}
                aria-label={t("delete")}
              >
                ×
              </button>
            </span>
          ))
        )}
        <label className="inline-flex h-8 w-full min-w-0 cursor-pointer items-center justify-center gap-1 truncate rounded-md border border-dashed border-subtle bg-transparent px-1.5 text-12 text-secondary transition-colors duration-150 hover:border-accent-subtle hover:bg-layer-1 hover:text-primary motion-reduce:transition-none">
          <Paperclip className="size-3 shrink-0" />
          <span className="truncate">
            {t(
              field.field_type === "image"
                ? "requirement_grid.data.upload_image"
                : "requirement_grid.data.upload_file"
            )}
          </span>
          <input
            type="file"
            className="sr-only"
            accept={field.field_type === "image" ? "image/*" : undefined}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void onUpload(file, field.field_type === "image").then((asset) => onChange([...assets, asset]));
              event.target.value = "";
            }}
          />
        </label>
      </div>
    );
  }
  if (field.field_type === "rich_text") {
    const richTextProps = {
      workspaceSlug,
      entityId,
      editorId: `requirement-field-${field.id}`,
      value: typeof value === "string" ? value : "",
      onChange,
      placeholder: field.config.placeholder,
      onAssetUpload,
    };
    return variant === "detail" ? (
      <RequirementRichTextEditor
        {...richTextProps}
        containerClassName="min-h-20 rounded-md border border-subtle bg-surface-1 pt-2 pr-2 text-13"
      />
    ) : (
      <RequirementRichTextCell {...richTextProps} label={field.name} variant={variant} deferCommit={deferTextCommit} />
    );
  }
  // 单行文本也带展开按钮：160px 列宽下一句稍长的话就看不全，与富文本单元格同一套外壳
  return (
    <RequirementTextCell
      value={typeof value === "string" ? value : ""}
      onChange={onChange}
      label={field.name}
      placeholder={isTableCell ? undefined : (field.config.placeholder ?? field.name)}
      variant={variant}
      deferCommit={deferTextCommit ?? variant === "detail"}
    />
  );
};
