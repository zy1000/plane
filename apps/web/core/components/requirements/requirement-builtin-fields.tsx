import {
  AlignLeft,
  CalendarClock,
  CalendarDays,
  CircleDot,
  GitBranch,
  SignalHigh,
  Type,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ISSUE_PRIORITIES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TRequirementBuiltinKey, TRequirementBuiltinValues, TRequirementPriority } from "@plane/types";
import { PriorityIcon } from "@plane/propel/icons";
import { cn, renderFormattedDate, renderFormattedPayloadDate, stripAndTruncateHTML } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { DraftInput } from "./draft-input";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import {
  FIELD_DROPDOWN_CLASS,
  FIELD_HEADLINE_INPUT_CLASS,
  FIELD_INPUT_CLASS,
  RequirementMemberValue,
} from "./requirement-grid-shared";
import { RequirementParentDropdown } from "./requirement-parent-dropdown";
import { RequirementRichTextCell } from "./requirement-rich-text";
import { RequirementStatusCell } from "./requirement-status-cell";

/**
 * 八个内置字段。它们不是 RequirementField，而是需求行上的列，所以网格、diff、
 * 版本快照、需求类型的字段结构页都从这张表拿列头与列序，而不是从字段树里找。
 *
 * 顺序即列序：内置列恒定排在自定义字段之前，不可拖动、不可删除、不可停用。
 * typeLabelKey 只用于展示 —— 内置列没有 field_type，它们的形状是写死在列上的。
 *
 * showInLibrary=false 的四列是纯执行期属性：标准库是模板，模板不可能知道某个产品里
 * 谁负责、什么时候做，「已发布」这种交付状态放在模板上更是自相矛盾。它们在库的表单与
 * 网格里不渲染，导入时也会被重置回缺省值（见 build_library_import_creates）。
 */
export const REQUIREMENT_BUILTIN_COLUMNS = [
  {
    key: "title",
    isContent: true,
    showInLibrary: true,
    labelKey: "requirement_fields.builtin.title",
    typeLabelKey: "requirement_fields.field_types.text",
    icon: Type,
    width: "w-56",
  },
  {
    key: "description_html",
    isContent: true,
    showInLibrary: true,
    labelKey: "requirement_fields.builtin.description",
    typeLabelKey: "requirement_fields.field_types.rich_text",
    icon: AlignLeft,
    width: "w-64",
  },
  {
    key: "status",
    // 需求级交付状态：人工维护，但不算「内容」—— 不参与评审比对、不进 diff（isContent:false 保持）。
    // 写入口是独立的状态端点（RequirementStatusCell 的 onChange），不走内置列编辑器。
    isContent: false,
    showInLibrary: false,
    labelKey: "requirement_fields.builtin.status",
    typeLabelKey: "requirement_fields.field_types.select",
    icon: CircleDot,
    width: "w-36",
  },
  {
    key: "priority",
    isContent: true,
    showInLibrary: true,
    labelKey: "requirement_fields.builtin.priority",
    typeLabelKey: "requirement_fields.field_types.select",
    icon: SignalHigh,
    width: "w-32",
  },
  {
    key: "assignee_id",
    isContent: true,
    showInLibrary: false,
    labelKey: "requirement_fields.builtin.assignee",
    typeLabelKey: "requirement_fields.field_types.member",
    icon: UserRound,
    width: "w-40",
  },
  {
    key: "start_date",
    isContent: true,
    showInLibrary: false,
    labelKey: "requirement_fields.builtin.start_date",
    typeLabelKey: "requirement_fields.builtin.types.date",
    icon: CalendarDays,
    width: "w-36",
  },
  {
    key: "target_date",
    isContent: true,
    showInLibrary: false,
    labelKey: "requirement_fields.builtin.target_date",
    typeLabelKey: "requirement_fields.builtin.types.date",
    icon: CalendarClock,
    width: "w-36",
  },
  {
    key: "parent_id",
    isContent: true,
    showInLibrary: true,
    labelKey: "requirement_fields.builtin.parent",
    typeLabelKey: "requirement_fields.builtin.types.parent",
    icon: GitBranch,
    width: "w-48",
  },
] as const satisfies readonly {
  key: TRequirementBuiltinKey;
  /** 算不算「内容」。false 的列不进 diff、不触发评审、不被内容回滚倒推 */
  isContent: boolean;
  showInLibrary: boolean;
  labelKey: string;
  typeLabelKey: string;
  icon: LucideIcon;
  width: string;
}[];

/**
 * 参与「内容变了没有」比对的内置列。
 *
 * 服务端的 changed_field_ids 管不到前端自己用 isEqual 算 diff 的那几处，所以那些地方要
 * 显式切到这个子集，否则「改了状态」会在变更单里渲染成一行需要审批人签字的改动。
 */
export const REQUIREMENT_CONTENT_BUILTIN_COLUMNS = REQUIREMENT_BUILTIN_COLUMNS.filter(
  (column) => column.isContent
);

/** 这批需求行该显示哪些内置列。标准库藏掉执行期四列，产品需求八列全出 */
export const getBuiltinColumnsFor = (entityKind: "product" | "library") =>
  entityKind === "library"
    ? REQUIREMENT_BUILTIN_COLUMNS.filter((column) => column.showInLibrary)
    : REQUIREMENT_BUILTIN_COLUMNS;

/** 后端的列缺省值，新建行与「清空」都用它 */
export const createEmptyBuiltinValues = (): TRequirementBuiltinValues => ({
  title: "",
  description_html: null,
  status: "not_started",
  priority: "none",
  assignee_id: null,
  start_date: null,
  target_date: null,
  parent_id: null,
});

/** 从一行里摘出内置列，供拷贝行与提交载荷使用 */
export const pickBuiltinValues = (row: Partial<TRequirementBuiltinValues>): TRequirementBuiltinValues => {
  const empty = createEmptyBuiltinValues();
  return Object.fromEntries(
    (Object.keys(empty) as TRequirementBuiltinKey[]).map((key) => [key, row[key] ?? empty[key]])
  ) as TRequirementBuiltinValues;
};

type TBuiltinEditorProps = {
  columnKey: TRequirementBuiltinKey;
  values: TRequirementBuiltinValues;
  onChange: (patch: Partial<TRequirementBuiltinValues>) => void;
  /** 父项选择器的检索范围：产品需求传产品，标准库条目传库 */
  parentScope: { workspaceSlug: string; productId?: string; libraryId?: string };
  /** 编辑中的行，父项选项里要排除它自己 */
  rowId?: string;
  /** 网格草稿把描述富文本里上传的资源登记为待提交，取消编辑时统一清理 */
  onAssetUpload?: (assetId: string) => void;
  /**
   * 控件所处的语境，决定静息长什么样：grid/detail 无底色，modal 走实边框
   * （见 FIELD_INPUT_CLASS）。headline 与 chip 是建行弹窗里的两个特写位 ——
   * 标题行和底部属性条，底子仍是 modal 那套。
   */
  variant?: "grid" | "detail" | "modal" | "headline" | "chip";
  /**
   * 标题 / 描述是否延后到失焦再提交。网格里必须开 —— 那里的 onChange 会直接打接口保存这一行，
   * 逐字符提交等于每敲一个字发一次请求。建行弹窗里 onChange 只写本地 state，不用开
   * （开了反而会让「标题为空则禁用确定」的判断慢一拍）。
   */
  deferTextCommit?: boolean;
  /** 标题挂载时抢焦点。网格内联新增一行后用它把光标送到新行上 */
  autoFocus?: boolean;
  /** 标题的占位文案。网格里标题旁边就是列头，不需要；弹窗里没有列头，得靠它 */
  placeholder?: string;
};

/** 单个内置列的编辑器。与自定义字段的 LeafEditor 并列，网格按列来源二选一 */
export const BuiltinCellEditor = ({
  columnKey,
  values,
  onChange,
  parentScope,
  rowId,
  onAssetUpload,
  variant = "grid",
  deferTextCommit = false,
  autoFocus = false,
  placeholder,
}: TBuiltinEditorProps) => {
  const { t } = useTranslation();
  /** headline / chip 只改这一个控件的取景，不另起一套底子 */
  const base = variant === "headline" || variant === "chip" ? "modal" : variant;
  // 详情页跟着工作项侧栏走透明下拉；网格保留边框按钮，否则单元格看不出能点
  const dropdownVariant = base === "detail" ? "transparent-with-text" : "border-with-text";
  const inputClass = variant === "headline" ? FIELD_HEADLINE_INPUT_CLASS : FIELD_INPUT_CLASS[base];
  // 网格有列头，空值不必再写「选择成员」「开始日期」这类提示；详情页与建行弹窗没有列头，才保留
  const isGrid = base === "grid";
  // 属性条上的胶囊与工作项 IssueDefaultProperties 同高（h-7），别跟着字段行的 38px 跑
  const isChip = variant === "chip";
  const dropdownClass = cn(
    FIELD_DROPDOWN_CLASS[base],
    isChip && "h-7 w-auto !border-strong bg-transparent px-2"
  );
  const containerClass = isChip ? "min-w-0" : "w-full min-w-0";

  if (columnKey === "title") {
    return deferTextCommit ? (
      <DraftInput
        value={values.title}
        onCommit={(next) => onChange({ title: next })}
        maxLength={255}
        className={inputClass}
        autoFocus={autoFocus}
        placeholder={placeholder}
      />
    ) : (
      <input
        value={values.title}
        onChange={(event) => onChange({ title: event.target.value })}
        maxLength={255}
        className={inputClass}
        autoFocus={autoFocus}
        placeholder={placeholder}
      />
    );
  }

  if (columnKey === "description_html") {
    // 描述与自定义 rich_text 字段是同一个类型，网格里就得是同一个控件
    return (
      <RequirementRichTextCell
        workspaceSlug={parentScope.workspaceSlug}
        entityId={parentScope.productId ?? parentScope.libraryId ?? ""}
        editorId={`requirement-description-${rowId ?? "new"}`}
        label={t("requirement_fields.builtin.description")}
        value={values.description_html ?? ""}
        onChange={(html) => onChange({ description_html: html })}
        onAssetUpload={onAssetUpload}
        variant={base}
        deferCommit={deferTextCommit}
      />
    );
  }

  if (columnKey === "status") {
    // 状态不走内容 PATCH：这里恒只读，改状态由各页面单独渲染带 onChange 的
    // RequirementStatusCell（走独立的状态端点）。服务端同样会忽略内容载荷里的 status。
    // 撑到和其它编辑器一样的行高，免得进出编辑态时整行跳一下。
    return (
      <div className="flex h-8 min-w-0 items-center px-2">
        <RequirementStatusCell status={values.status} />
      </div>
    );
  }

  if (columnKey === "priority") {
    return (
      <PriorityDropdown
        // none 在 ISSUE_PRIORITIES 里有自己的标题「None」和占位图标，网格列头已经说明是优先级，空值保持空白
        value={isGrid && values.priority === "none" ? null : values.priority}
        placeholder={isGrid ? "" : undefined}
        hideIcon={isGrid && (!values.priority || values.priority === "none")}
        onChange={(next) => onChange({ priority: next as TRequirementPriority })}
        buttonVariant={dropdownVariant}
        buttonClassName={dropdownClass}
        buttonContainerClassName={containerClass}
      />
    );
  }

  if (columnKey === "assignee_id") {
    return (
      <MemberDropdown
        multiple={false}
        value={values.assignee_id}
        onChange={(memberId) => onChange({ assignee_id: memberId })}
        buttonVariant={dropdownVariant}
        buttonClassName={cn(dropdownClass, "text-14")}
        buttonContainerClassName={containerClass}
        placeholder={isGrid ? "" : t("requirement_grid.data.select_member")}
        showUserDetails
      />
    );
  }

  if (columnKey === "start_date" || columnKey === "target_date") {
    // 起止日期互为边界，让下拉自己挡掉倒挂的选择，而不是等提交时报错
    const isStart = columnKey === "start_date";
    return (
      <DateDropdown
        value={values[columnKey]}
        onChange={(date) => onChange({ [columnKey]: renderFormattedPayloadDate(date) ?? null })}
        minDate={!isStart && values.start_date ? new Date(values.start_date) : undefined}
        maxDate={isStart && values.target_date ? new Date(values.target_date) : undefined}
        placeholder={isGrid ? "" : t(`requirement_fields.builtin.${isStart ? "start_date" : "target_date"}`)}
        buttonVariant={dropdownVariant}
        buttonClassName={dropdownClass}
        buttonContainerClassName={containerClass}
      />
    );
  }

  return (
    <RequirementParentDropdown
      value={values.parent_id}
      onChange={(parentId) => onChange({ parent_id: parentId })}
      excludeId={rowId}
      placeholder={isGrid ? "" : undefined}
      buttonClassName={cn(dropdownClass, isChip && "gap-1.5")}
      // 胶囊上没有字段名，图标就是它的标签 —— 其余几个下拉自带图标，这个得显式给
      icon={isChip ? GitBranch : undefined}
      containerClassName={isChip ? "w-auto" : undefined}
      {...parentScope}
    />
  );
};

type TBuiltinValueProps = {
  columnKey: TRequirementBuiltinKey;
  values: Partial<TRequirementBuiltinValues>;
  /**
   * 父项存的是 UUID，只有调用方知道怎么换成标题（见 useRequirementTitles）。
   * 负责人不用传 —— 成员是全局 store，这里自己查得到。
   */
  resolveParentTitle?: (parentId: string) => string | undefined;
};

/** 内置列的只读渲染。网格、diff 网格、版本快照、导入弹窗共用 */
export const BuiltinCellValue = ({ columnKey, values, resolveParentTitle }: TBuiltinValueProps) => {
  const { t } = useTranslation();
  const value = values[columnKey];

  // 字号一律继承单元格（网格是 text-13，详情页自己定）—— 之前这里写死 text-14，
  // 于是表格里正文比表头还大一号，层级是反的
  if (value === null || value === undefined || value === "") {
    return <span className="text-placeholder">—</span>;
  }

  if (columnKey === "status") {
    return <RequirementStatusCell status={value as string} />;
  }
  if (columnKey === "priority") {
    // 与编辑态的 PriorityDropdown 用同一份词汇（ISSUE_PRIORITIES 的原值），不另做一套翻译 ——
    // 否则同一个字段读的时候是「高」、改的时候是「High」，是两套语言。
    const priority = value as TRequirementPriority;
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <PriorityIcon priority={priority} size={12} className="shrink-0" />
        <span className="truncate">{ISSUE_PRIORITIES.find((item) => item.key === priority)?.title ?? priority}</span>
      </span>
    );
  }
  if (columnKey === "start_date" || columnKey === "target_date") {
    return <span className="truncate">{renderFormattedDate(value as string)}</span>;
  }
  if (columnKey === "assignee_id") {
    return <RequirementMemberValue value={value} />;
  }
  if (columnKey === "parent_id") {
    const title = resolveParentTitle?.(value as string);
    // 解析不出来也绝不把 UUID 甩给用户 —— 那既看不懂也没法用
    return title ? (
      <span className="truncate">{title}</span>
    ) : (
      <span className="truncate text-placeholder">{t("requirement_fields.builtin.parent_unresolved")}</span>
    );
  }
  if (columnKey === "description_html") {
    // 存的是 HTML，直接吐出来用户看到的会是一串标签
    return <span className="truncate">{stripAndTruncateHTML(value as string, 180)}</span>;
  }
  return <span className="truncate">{value as string}</span>;
};
