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
import type {
  TRequirementBuiltinKey,
  TRequirementBuiltinValues,
  TRequirementItemStatus,
  TRequirementPriority,
} from "@plane/types";
import { PriorityIcon } from "@plane/propel/icons";
import { renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { RequirementMemberValue } from "./requirement-grid-shared";
import { RequirementParentDropdown } from "./requirement-parent-dropdown";

/**
 * 八个内置字段。它们不是 RequirementField，而是需求行上的列，所以网格、diff、
 * 版本快照、需求类型的字段结构页都从这张表拿列头与列序，而不是从字段树里找。
 *
 * 顺序即列序：内置列恒定排在自定义字段之前，不可拖动、不可删除、不可停用。
 * typeLabelKey 只用于展示 —— 内置列没有 field_type，它们的形状是写死在列上的。
 *
 * showInLibrary=false 的四列是纯执行期属性：标准库是模板，模板不可能知道某个产品里
 * 谁负责、什么时候做，「已实现」这种状态放在模板上更是自相矛盾。它们在库的表单与
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
    // 交付进度轴，不是被批准的内容 —— 不参与评审比对，也由系统写而非用户手选
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
 * 显式切到这个子集，否则「标了已实现」会在变更单里渲染成一行需要审批人签字的改动。
 */
export const REQUIREMENT_CONTENT_BUILTIN_COLUMNS = REQUIREMENT_BUILTIN_COLUMNS.filter(
  (column) => column.isContent
);

/** 这批需求行该显示哪些内置列。标准库藏掉执行期四列，产品需求八列全出 */
export const getBuiltinColumnsFor = (entityKind: "product" | "library") =>
  entityKind === "library"
    ? REQUIREMENT_BUILTIN_COLUMNS.filter((column) => column.showInLibrary)
    : REQUIREMENT_BUILTIN_COLUMNS;

/**
 * 详情页要不要单独展示 status。draft/confirmed 与标题旁的审批胶囊说的是同一件事，
 * 两个「已确认」并排只会让人分不清哪个才是评审结论。等 status 变成派生的研发阶段
 * （未开始/研发中/已发布…）之后，它就不再与审批轴重复，这个判断可以去掉。
 */
export const shouldShowRequirementStatus = (status: TRequirementItemStatus) =>
  status !== "draft" && status !== "confirmed";

/** 后端的列缺省值，新建行与「清空」都用它 */
export const createEmptyBuiltinValues = (): TRequirementBuiltinValues => ({
  title: "",
  description_html: null,
  status: "draft",
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

const INPUT_CLASS =
  "focus:border-accent-primary focus:ring-accent-primary/10 h-8 w-full min-w-0 rounded-md border border-transparent bg-layer-1/60 px-2 text-14 text-primary transition-[border-color,background-color,box-shadow] duration-150 outline-none hover:border-subtle hover:bg-layer-1 focus:bg-surface-1 focus:ring-2 motion-reduce:transition-none";

const DROPDOWN_BUTTON_CLASS =
  "h-8 w-full min-w-0 border !border-transparent bg-layer-1/60 px-2 transition-colors duration-150 hover:!border-subtle hover:bg-layer-1 focus:!border-accent-primary focus:bg-surface-1 motion-reduce:transition-none";

type TBuiltinEditorProps = {
  columnKey: TRequirementBuiltinKey;
  values: TRequirementBuiltinValues;
  onChange: (patch: Partial<TRequirementBuiltinValues>) => void;
  /** 父项选择器的检索范围：产品需求传产品，标准库条目传库 */
  parentScope: { workspaceSlug: string; productId?: string; libraryId?: string };
  /** 编辑中的行，父项选项里要排除它自己 */
  rowId?: string;
};

/** 单个内置列的编辑器。与自定义字段的 LeafEditor 并列，网格按列来源二选一 */
export const BuiltinCellEditor = ({ columnKey, values, onChange, parentScope, rowId }: TBuiltinEditorProps) => {
  const { t } = useTranslation();

  if (columnKey === "title") {
    return (
      <input
        value={values.title}
        onChange={(event) => onChange({ title: event.target.value })}
        maxLength={255}
        className={INPUT_CLASS}
      />
    );
  }

  if (columnKey === "description_html") {
    return (
      <textarea
        value={values.description_html ?? ""}
        onChange={(event) => onChange({ description_html: event.target.value })}
        rows={1}
        className="focus:border-accent-primary focus:ring-accent-primary/10 max-h-24 min-h-8 w-full min-w-0 resize-y rounded-md border border-transparent bg-layer-1/60 px-2 py-1.5 text-14 leading-5 text-primary transition-[border-color,background-color,box-shadow] duration-150 outline-none hover:border-subtle hover:bg-layer-1 focus:bg-surface-1 focus:ring-2 motion-reduce:transition-none"
      />
    );
  }

  if (columnKey === "status") {
    // 交付进度由系统写，编辑态也只读 —— 服务端同样会忽略客户端传来的 status。
    // 撑到和其它编辑器一样的行高，免得进出编辑态时整行跳一下。
    return (
      <div className="flex h-8 min-w-0 items-center px-2">
        <BuiltinCellValue columnKey="status" values={values} />
      </div>
    );
  }

  if (columnKey === "priority") {
    return (
      <PriorityDropdown
        value={values.priority}
        onChange={(next) => onChange({ priority: next as TRequirementPriority })}
        buttonVariant="border-with-text"
        buttonClassName={DROPDOWN_BUTTON_CLASS}
        buttonContainerClassName="w-full min-w-0"
      />
    );
  }

  if (columnKey === "assignee_id") {
    return (
      <MemberDropdown
        multiple={false}
        value={values.assignee_id}
        onChange={(memberId) => onChange({ assignee_id: memberId })}
        buttonVariant="border-with-text"
        buttonClassName={`${DROPDOWN_BUTTON_CLASS} text-14`}
        buttonContainerClassName="w-full min-w-0"
        placeholder={t("requirement_grid.data.select_member")}
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
        placeholder={t(`requirement_fields.builtin.${isStart ? "start_date" : "target_date"}`)}
        buttonVariant="border-with-text"
        buttonClassName={DROPDOWN_BUTTON_CLASS}
        buttonContainerClassName="w-full min-w-0"
      />
    );
  }

  return (
    <RequirementParentDropdown
      value={values.parent_id}
      onChange={(parentId) => onChange({ parent_id: parentId })}
      excludeId={rowId}
      buttonClassName={DROPDOWN_BUTTON_CLASS}
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

  if (value === null || value === undefined || value === "") {
    return <span className="text-14 text-placeholder">—</span>;
  }

  if (columnKey === "status") {
    return <span className="truncate text-14">{t(`requirement_fields.statuses.${value as TRequirementItemStatus}`)}</span>;
  }
  if (columnKey === "priority") {
    // 与编辑态的 PriorityDropdown 用同一份词汇（ISSUE_PRIORITIES 的原值），不另做一套翻译 ——
    // 否则同一个字段读的时候是「高」、改的时候是「High」，是两套语言。
    const priority = value as TRequirementPriority;
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-14">
        <PriorityIcon priority={priority} size={12} className="shrink-0" />
        <span className="truncate">{ISSUE_PRIORITIES.find((item) => item.key === priority)?.title ?? priority}</span>
      </span>
    );
  }
  if (columnKey === "start_date" || columnKey === "target_date") {
    return <span className="truncate text-14">{renderFormattedDate(value as string)}</span>;
  }
  if (columnKey === "assignee_id") {
    return <RequirementMemberValue value={value} />;
  }
  if (columnKey === "parent_id") {
    const title = resolveParentTitle?.(value as string);
    // 解析不出来也绝不把 UUID 甩给用户 —— 那既看不懂也没法用
    return title ? (
      <span className="truncate text-14">{title}</span>
    ) : (
      <span className="truncate text-14 text-placeholder">{t("requirement_fields.builtin.parent_unresolved")}</span>
    );
  }
  return <span className="truncate text-14">{value as string}</span>;
};
