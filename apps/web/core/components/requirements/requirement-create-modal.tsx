"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cloneDeep } from "lodash-es";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type {
  TRequirementBatchSavePayload,
  TRequirementBatchSaveResponse,
  TRequirementBuiltinValues,
  TRequirementData,
  TRequirementField,
  TRequirementAssetRef,
} from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { FileService } from "@/services/file.service";
import {
  BuiltinCellEditor,
  createEmptyBuiltinValues,
  getBuiltinColumnsFor,
} from "./requirement-builtin-fields";
import { createEmptyRequirementData } from "./requirement-row-data";
import { LeafEditor } from "./requirement-grid-shared";

const fileService = new FileService();

/**
 * 新建需求的弹窗。
 *
 * 已有行是「改一格存一格」，新增行走不了同一条路：后端建行时强制校验必填字段
 * （serializers/requirement.py 的 enforce_required），点一下就 POST 一个空行会被
 * 直接拒绝。所以新增改成在弹窗里填齐、点确定一次落库 —— 表格里因此不再有任何
 * 未保存的草稿行，「保存更改 / 取消 / 离开页面提醒」整套暂存机制都可以退休。
 *
 * 「复制行」也走这里：用源行的值预填，用户确认后才建出来。
 */
export type TRequirementCreateSeed = {
  /** 复制行时带上源行的值；手动新增传 undefined */
  data?: TRequirementData;
  builtin?: TRequirementBuiltinValues;
  /** 插到哪一行前/后。不传就追加到末尾 */
  beforeId?: string;
  afterId?: string;
};

type TProps = {
  isOpen: boolean;
  workspaceSlug: string;
  /** 附件挂在哪个实体上：产品需求传 productId，标准库条目传 libraryId */
  entityId: string;
  entityKind: "product" | "library";
  /** 这一行绑定的需求类型。标准库不用传（库本身固定了类型） */
  requirementTypeId?: string;
  fields: TRequirementField[];
  seed?: TRequirementCreateSeed;
  onClose: () => void;
  onSave: (payload: TRequirementBatchSavePayload) => Promise<TRequirementBatchSaveResponse>;
  onUpload: (file: globalThis.File, imageOnly: boolean) => Promise<TRequirementAssetRef>;
};

export const RequirementCreateModal = ({
  isOpen,
  workspaceSlug,
  entityId,
  entityKind,
  requirementTypeId,
  fields,
  seed,
  onClose,
  onSave,
  onUpload,
}: TProps) => {
  const { t } = useTranslation();
  const [builtin, setBuiltin] = useState<TRequirementBuiltinValues>(createEmptyBuiltinValues);
  const [data, setData] = useState<TRequirementData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 弹窗里传上去的资源。取消建行就得删掉，否则留一堆没有归属的孤儿文件 */
  const [pendingAssetIds, setPendingAssetIds] = useState<string[]>([]);

  /*
   * 状态列不进弹窗：它由系统写，BuiltinCellEditor 对它本来就只渲染只读值，而且
   * 后端建行时一律拍成 draft（row_base.py 的 bulk_save）。摆一个改不动的字段是噪音。
   */
  const builtinColumns = useMemo(
    () => getBuiltinColumnsFor(entityKind).filter((column) => column.key !== "status"),
    [entityKind]
  );
  const visibleFields = useMemo(() => fields.filter((field) => field.is_active), [fields]);

  useEffect(() => {
    if (!isOpen) return;
    setBuiltin(seed?.builtin ? { ...seed.builtin } : createEmptyBuiltinValues());
    setData(seed?.data ? cloneDeep(seed.data) : createEmptyRequirementData(visibleFields));
    setPendingAssetIds([]);
    setError(null);
    // seed 只在打开的那一刻取一次快照；开着的时候源行变了不该把用户填了一半的值冲掉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const registerAsset = useCallback((assetId: string) => setPendingAssetIds((ids) => [...ids, assetId]), []);

  const discardAsset = useCallback(
    (assetId: string) => {
      setPendingAssetIds((ids) => ids.filter((id) => id !== assetId));
      void fileService.deleteWorkspaceAsset(workspaceSlug, assetId);
    },
    [workspaceSlug]
  );

  const handleUpload = useCallback(
    async (file: globalThis.File, imageOnly: boolean) => {
      const asset = await onUpload(file, imageOnly);
      registerAsset(asset.asset_id);
      return asset;
    },
    [onUpload, registerAsset]
  );

  const handleClose = useCallback(() => {
    // 取消 = 这一行从未存在过，弹窗里传上去的东西一并清掉
    if (pendingAssetIds.length) {
      void Promise.allSettled(pendingAssetIds.map((id) => fileService.deleteWorkspaceAsset(workspaceSlug, id)));
    }
    onClose();
  }, [onClose, pendingAssetIds, workspaceSlug]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onSave({
        creates: [
          {
            client_id: uuidv4(),
            data,
            builtin,
            ...(requirementTypeId ? { requirement_type_id: requirementTypeId } : {}),
            ...(seed?.beforeId ? { before_id: seed.beforeId } : {}),
            ...(seed?.afterId ? { after_id: seed.afterId } : {}),
          },
        ],
        updates: [],
        deletes: [],
      });
      // 落库成功，这些资源已经有归属了，不再是待清理的孤儿
      setPendingAssetIds([]);
      onClose();
    } catch (submitError) {
      const payload = submitError as { error?: string; detail?: string };
      setError(payload?.error ?? payload?.detail ?? t("workspace_products.requirements.toast.failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isTitleEmpty = !builtin.title.trim();

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="border-b border-subtle px-5 py-4">
        <h2 className="text-14 font-medium text-primary">{t("requirement_grid.data.add")}</h2>
      </div>

      {/*
        控件用 modal 变体：grid 与 detail 静息都是透明无边框 —— 网格靠格线与相邻单元格
        衬托，详情侧栏靠相邻标签，两者都有别的东西在说明「这里能填」。弹窗里没有格线也
        没有那种密排上下文，照搬过来就是一片看不出能点的空白，所以这里用实边框的常规
        表单输入框。
        标题与描述独占一行，其余短字段两列排 —— 否则一个类型十几个字段要滚很久。
      */}
      <div className="grid max-h-[60vh] grid-cols-1 gap-x-4 gap-y-3.5 overflow-auto px-5 py-4 sm:grid-cols-2">
        {builtinColumns.map((column) => {
          const Icon = column.icon;
          const isWide = column.key === "title" || column.key === "description_html";
          return (
            <label key={column.key} className={cn("block min-w-0", isWide && "sm:col-span-2")}>
              <span className="mb-1 flex items-center gap-1 text-12 font-medium text-secondary">
                <Icon className="size-3.5 shrink-0 text-placeholder" />
                {t(column.labelKey)}
              </span>
              <BuiltinCellEditor
                variant="modal"
                columnKey={column.key}
                values={builtin}
                onChange={(patch) => setBuiltin((current) => ({ ...current, ...patch }))}
                parentScope={
                  entityKind === "product"
                    ? { workspaceSlug, productId: entityId }
                    : { workspaceSlug, libraryId: entityId }
                }
                onAssetUpload={registerAsset}
              />
            </label>
          );
        })}

        {visibleFields.map((field) => (
          <label
            key={field.id}
            className={cn("block min-w-0", (field.field_type === "form" || field.field_type === "rich_text") && "sm:col-span-2")}
          >
            <span className="mb-1 flex items-center gap-0.5 text-12 font-medium text-secondary">
              {field.name}
              {field.is_required && <span className="text-danger-primary">*</span>}
            </span>
            <LeafEditor
              variant="modal"
              field={field}
              value={data[field.id]}
              workspaceSlug={workspaceSlug}
              entityId={entityId}
              onChange={(value) => setData((current) => ({ ...current, [field.id]: value }))}
              onUpload={handleUpload}
              onRemoveAsset={discardAsset}
              onAssetUpload={registerAsset}
              deferTextCommit
            />
          </label>
        ))}

        {error && <p className="text-12 text-danger-primary sm:col-span-2">{error}</p>}
      </div>

      <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting || isTitleEmpty}>
          {t("requirement_grid.data.add")}
        </Button>
      </div>
    </ModalCore>
  );
};
