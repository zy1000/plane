/**
 * 需求明细网格的可复用件。
 *
 * 编辑态网格（requirement-detail-grid.tsx）、变更 diff 网格和版本只读快照共用同一套
 * 二级表头结构、值渲染和行内子表单排布逻辑，所以这些纯 helper 与展示组件抽在这里。
 */
import { Fragment, useState } from "react";
import { observer } from "mobx-react";
import { Download, File } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Modal, Typography } from "antd";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirementAssetRef,
  TRequirementDetailData,
  TRequirementDetailValue,
  TRequirementField,
  TRequirementFormRow,
} from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getEditorAssetDownloadSrc, getEditorAssetSrc, getFileURL, stripAndTruncateHTML } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { getRequirementSelectLabel } from "./requirement-select";

export const getFormRows = (data: TRequirementDetailData, fieldId: string): TRequirementFormRow[] => {
  const value = data[fieldId];
  return Array.isArray(value) ? (value as TRequirementFormRow[]) : [];
};

export const getMaxFormRows = (data: TRequirementDetailData, formFields: TRequirementField[]) =>
  formFields.reduce((max, field) => Math.max(max, getFormRows(data, field.id).length), 0);

/** Number of table columns a repeatable form occupies: one per visible child, plus a trailing action gutter. */
export const getFormColumnCount = (form: TRequirementField, withGutter: boolean) =>
  form.children.length ? form.children.length + (withGutter ? 1 : 0) : 1;

export const getDetailRowKey = (
  detailKey: string,
  data: TRequirementDetailData,
  formFields: TRequirementField[],
  rowPosition: number
) =>
  `${detailKey}-${
    formFields
      .map((form) => getFormRows(data, form.id)[rowPosition]?.id)
      .filter(Boolean)
      .join("-") || "root"
  }`;

export const isEmptyDetailValue = (value: TRequirementDetailValue | undefined) =>
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

const RequirementMemberValue = observer(function RequirementMemberValue({ value }: { value: unknown }) {
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
              {preview?.name ?? t("workspace_templates.requirements.field_types.image")}
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
}: {
  field: TRequirementField;
  value: TRequirementDetailValue | undefined;
  workspaceSlug: string;
  /** diff 网格用它给旧值套删除线、给新值套绿色 */
  className?: string;
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
        {t(value ? "workspace_templates.requirements.data.yes" : "workspace_templates.requirements.data.no")}
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
  trailingHeader,
}: {
  rootFields: TRequirementField[];
  showActionGutter: boolean;
  leadingHeader?: { className: string; content: React.ReactNode };
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
                {t("workspace_templates.requirements.fields.no_children")}
              </th>
            )
          )}
        </tr>
      )}
    </thead>
  );
};
