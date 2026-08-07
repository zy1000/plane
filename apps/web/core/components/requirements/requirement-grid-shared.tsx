/**
 * 需求明细网格的可复用件。
 *
 * 编辑态网格（requirement-grid.tsx）、变更 diff 网格和版本只读快照共用同一套
 * 二级表头结构、值渲染和行内子表单排布逻辑，所以这些纯 helper 与展示组件抽在这里。
 */
import { Fragment, useState } from "react";
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
import { Avatar, CustomSelect, MultiSelectDropdown, ToggleSwitch } from "@plane/ui";
import type { TDropdownOption } from "@plane/ui";
import { cn, getEditorAssetDownloadSrc, getEditorAssetSrc, getFileURL, stripAndTruncateHTML } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useMember } from "@/hooks/store/use-member";
import { DraftInput } from "./draft-input";
import {
  RequirementRichTextCell,
  RequirementRichTextEditor,
  RequirementRichTextValue,
} from "./requirement-rich-text";
import { getRequirementSelectLabel, getRequirementSelectMode, getRequirementSelectOptions } from "./requirement-select";

export const getFormRows = (data: TRequirementData, fieldId: string): TRequirementFormRow[] => {
  const value = data[fieldId];
  return Array.isArray(value) ? (value as TRequirementFormRow[]) : [];
};

export const getMaxFormRows = (data: TRequirementData, formFields: TRequirementField[]) =>
  formFields.reduce((max, field) => Math.max(max, getFormRows(data, field.id).length), 0);

/** Number of table columns a repeatable form occupies: one per visible child, plus a trailing action gutter. */
export const getFormColumnCount = (form: TRequirementField, withGutter: boolean) =>
  form.children.length ? form.children.length + (withGutter ? 1 : 0) : 1;

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
      <span className="max-w-28 truncate text-14 text-primary">{member?.display_name ?? value}</span>
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
        destroyOnClose
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
  variant?: "grid" | "detail";
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
  return (
    <span className={cn("block max-w-64 text-14 leading-5 whitespace-pre-wrap text-primary", className)}>
      {field.field_type === "rich_text" ? stripAndTruncateHTML(String(value), 180) : String(value)}
    </span>
  );
};

/**
 * 二级表头：非表单根字段 rowSpan=2，表单字段作分组表头、子字段排在第二行。
 * 首列与末列由调用方给（编辑态给「勾选框」与「操作」，diff 模式给「变更」且没有末列）。
 */
export const RequirementGridHeader = ({
  rootFields,
  showActionGutter,
  leadingHeader,
  builtinHeaders,
  extraHeaders,
  trailingHeader,
}: {
  rootFields: TRequirementField[];
  showActionGutter: boolean;
  leadingHeader?: { className: string; content: React.ReactNode };
  /**
   * 内置列的表头，恒排在自定义字段列之前。内置列永远是单列，不参与表单字段的
   * 二级表头跨列逻辑，所以只跟着 spanRows 走。
   */
  builtinHeaders?: { key: string; className?: string; content: React.ReactNode }[];
  /** 字段列之后、操作列之前的附加列（产品需求的「变更 / 最后变更于」） */
  extraHeaders?: { key: string; className: string; content: React.ReactNode }[];
  trailingHeader?: { className: string; content: React.ReactNode };
}) => {
  const { t } = useTranslation();
  const formFields = rootFields.filter((field) => field.field_type === "form");
  const hasFormFields = formFields.length > 0;
  const spanRows = hasFormFields ? 2 : 1;

  return (
    <thead className="sticky top-0 z-10 bg-layer-1 text-13 font-medium text-secondary">
      <tr className="border-b border-subtle">
        {leadingHeader && (
          <th rowSpan={spanRows} className={leadingHeader.className}>
            {leadingHeader.content}
          </th>
        )}
        {builtinHeaders?.map((header) => (
          <th
            key={header.key}
            rowSpan={spanRows}
            className={cn("min-w-32 border-r border-subtle px-3 py-2.5 align-middle text-primary", header.className)}
          >
            {header.content}
          </th>
        ))}
        {rootFields.map((field) =>
          field.field_type === "form" ? (
            <th
              key={field.id}
              colSpan={getFormColumnCount(field, showActionGutter)}
              className="border-r border-subtle bg-accent-subtle/30 px-3 py-2.5 text-center text-primary"
            >
              {field.name}
            </th>
          ) : (
            <th
              key={field.id}
              rowSpan={spanRows}
              className="min-w-40 border-r border-subtle px-3 py-2.5 align-middle text-primary"
            >
              <span className="inline-flex items-center gap-0.5">
                {field.name}
                {field.is_required && <span className="text-danger-primary">*</span>}
              </span>
            </th>
          )
        )}
        {extraHeaders?.map((header) => (
          <th key={header.key} rowSpan={spanRows} className={header.className}>
            {header.content}
          </th>
        ))}
        {trailingHeader && (
          <th rowSpan={spanRows} className={trailingHeader.className}>
            {trailingHeader.content}
          </th>
        )}
      </tr>
      {hasFormFields && (
        <tr className="border-b border-subtle">
          {formFields.map((field) =>
            field.children.length ? (
              <Fragment key={field.id}>
                {field.children.map((child) => (
                  <th
                    key={child.id}
                    className="min-w-40 border-r border-subtle bg-accent-subtle/15 px-3 py-2 font-normal text-secondary"
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {child.name}
                      {child.is_required && <span className="text-danger-primary">*</span>}
                    </span>
                  </th>
                ))}
                {showActionGutter && (
                  <th aria-hidden className="w-9 border-r border-subtle bg-accent-subtle/15 px-0.5 py-2" />
                )}
              </Fragment>
            ) : (
              <th
                key={`${field.id}-empty`}
                className="min-w-40 border-r border-subtle bg-accent-subtle/15 px-3 py-2 font-normal text-placeholder"
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
 * grid：单元格之间没有标签，得靠「幽灵输入框」的底色告诉用户这一格可以点。
 * detail：标签已经把可编辑性说清楚了，再铺一层底色就是噪音 —— 与工作项详情侧栏
 * 对齐（见 issues/issue-detail/sidebar.tsx，全部 transparent-with-text，静息无底色）。
 */
export const FIELD_INPUT_CLASS = {
  grid: "focus:border-accent-primary focus:ring-accent-primary/10 h-8 w-full min-w-0 rounded-md border border-transparent bg-layer-1/60 px-2 text-14 text-primary transition-[border-color,background-color,box-shadow] duration-150 outline-none hover:border-subtle hover:bg-layer-1 focus:bg-surface-1 focus:ring-2 motion-reduce:transition-none",
  detail:
    "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-14 text-primary transition-colors duration-150 outline-none placeholder:text-placeholder hover:bg-layer-transparent-hover focus:border-accent-primary focus:bg-surface-1 motion-reduce:transition-none",
} as const;

/** 下拉按钮版：要用 ! 盖掉 @plane/ui 自带的边框 */
export const FIELD_DROPDOWN_CLASS = {
  grid: "h-8 w-full min-w-0 border !border-transparent bg-layer-1/60 px-2 transition-colors duration-150 hover:!border-subtle hover:bg-layer-1 focus:!border-accent-primary focus:bg-surface-1 motion-reduce:transition-none",
  detail:
    "h-8 w-full min-w-0 border !border-transparent bg-transparent px-2 transition-colors duration-150 hover:bg-layer-transparent-hover focus:!border-accent-primary focus:bg-surface-1 motion-reduce:transition-none",
} as const;

/** MultiSelectDropdown 走 buttonContainerClassName，没有 ! 之争 */
const MULTI_SELECT_CLASS = {
  grid: "h-8 w-full min-w-0 rounded-md border border-transparent bg-layer-1/60 px-2 transition-colors duration-150 hover:border-subtle hover:bg-layer-1 focus:border-accent-primary focus:bg-surface-1 motion-reduce:transition-none",
  detail:
    "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 transition-colors duration-150 hover:bg-layer-transparent-hover focus:border-accent-primary focus:bg-surface-1 motion-reduce:transition-none",
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
  /** detail 直接内联完整编辑器；grid 只有 160px 列宽，走摘要 + 弹窗 */
  variant?: "grid" | "detail";
  /**
   * 文本字段是否延后到失焦再提交。默认跟随 variant，但两者不是一回事：
   * 网格的 onChange 只写 draftRows（逐字符是对的，isDirty 要靠它），详情页与
   * 详情页里的子表单则是 onChange 即一次整行 PATCH，必须先落草稿。
   */
  deferTextCommit?: boolean;
}) => {
  const { t } = useTranslation();
  if (field.field_type === "boolean") {
    return <ToggleSwitch value={Boolean(value)} onChange={() => onChange(!value)} size="sm" />;
  }
  if (field.field_type === "select") {
    const options = getRequirementSelectOptions(field);
    const placeholder = field.config.placeholder ?? t("requirement_grid.data.select_option");
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
              <span className="truncate text-14">
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
            return (
              <span className={labels.length ? "truncate text-14 text-primary" : "truncate text-14 text-placeholder"}>
                {labels.length ? labels.join(", ") : placeholder}
              </span>
            );
          }}
          buttonContainerClassName={MULTI_SELECT_CLASS[variant]}
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
          <span className={selectedOption ? "truncate text-14 text-primary" : "truncate text-14 text-placeholder"}>
            {selectedOption?.label ?? placeholder}
          </span>
        }
        buttonClassName={FIELD_DROPDOWN_CLASS[variant]}
        optionsClassName="w-60"
        input
      >
        {!field.is_required && (
          <CustomSelect.Option value={null}>
            <span className="text-14 text-secondary">{t("requirement_grid.data.clear_selection")}</span>
          </CustomSelect.Option>
        )}
        {options.map((option) => (
          <CustomSelect.Option key={option.id} value={option.id}>
            <span className="truncate text-14">{option.label}</span>
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
        buttonVariant={variant === "detail" ? "transparent-with-text" : "border-with-text"}
        buttonClassName={cn(FIELD_DROPDOWN_CLASS[variant], "text-14")}
        buttonContainerClassName="w-full min-w-0"
        placeholder={field.config.placeholder ?? t("requirement_grid.data.select_member")}
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
    return (
      <div className="flex w-full min-w-0 flex-col gap-1">
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
        <label className="inline-flex h-7 w-full min-w-0 cursor-pointer items-center justify-center gap-1 truncate rounded-md border border-dashed border-subtle bg-transparent px-1.5 text-12 text-secondary transition-colors duration-150 hover:border-accent-subtle hover:bg-layer-1 hover:text-primary motion-reduce:transition-none">
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
      <RequirementRichTextCell {...richTextProps} label={field.name} />
    );
  }
  const text = typeof value === "string" ? value : "";
  return (deferTextCommit ?? variant === "detail") ? (
    <DraftInput
      value={text}
      onCommit={onChange}
      className={FIELD_INPUT_CLASS[variant]}
      placeholder={field.config.placeholder}
    />
  ) : (
    <input
      value={text}
      onChange={(event) => onChange(event.target.value)}
      className={FIELD_INPUT_CLASS[variant]}
      placeholder={field.config.placeholder}
    />
  );
};
