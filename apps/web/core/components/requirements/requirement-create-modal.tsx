"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cloneDeep } from "lodash-es";
import { AlignLeft } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type {
  TRequirementBatchSavePayload,
  TRequirementBatchSaveResponse,
  TRequirementBuiltinFieldConfig,
  TRequirementBuiltinValues,
  TRequirementData,
  TRequirementField,
  TRequirementAssetRef,
} from "@plane/types";
import { EModalPosition, EModalWidth, Input, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useRequirementTypeFields } from "@/hooks/store/use-requirement-type-fields";
import { useRequirementTypes } from "@/hooks/store/use-requirement-types";
import { FileService } from "@/services/file.service";
import { BuiltinCellEditor, createEmptyBuiltinValues } from "./requirement-builtin-fields";
import { resolveBuiltinColumns } from "./requirement-builtin-layout";
import { FIELD_ICONS } from "./requirement-field-builder";
import { RequirementSubformSection } from "./requirement-detail/requirement-subform-section";
import { createEmptyRequirementData } from "./requirement-row-data";
import { LeafEditor } from "./requirement-grid-shared";
import { RequirementRichTextField } from "./requirement-rich-text";
import { RequirementTypeSelect } from "./requirement-type-select";

/**
 * 建行弹窗字段行图标与工作项 ExtraFieldRow / FIELD_TYPE_ICON 对齐：
 * text 用 AlignLeft（三条横线），不用字段库里那个 Type（字母 T）。
 */
const CREATE_MODAL_FIELD_ICONS = {
  ...FIELD_ICONS,
  text: AlignLeft,
} as const;

const fileService = new FileService();

/** 默认值不能写成字面量 —— 每次渲染都是新数组，会把下面几个 useMemo 全部打穿 */
const EMPTY_FIELDS: TRequirementField[] = [];

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
  /**
   * 开了就在弹窗里选类型、字段随选择切换（总览视图走这条）；
   * 关着就用下面的 fields —— 类型视图与标准库里类型已经定死了，没得选。
   */
  allowTypeSelection?: boolean;
  /** 类型固定时这一行的字段。allowTypeSelection 时不用它 */
  fields?: TRequirementField[];
  /** 类型固定时该类型的内置字段布局；allowTypeSelection 时随选中类型自取，不用它 */
  builtinLayout?: TRequirementBuiltinFieldConfig[] | null;
  seed?: TRequirementCreateSeed;
  /** 左侧模块树的当前选中：弹窗建出的行自动挂进该模块 */
  moduleId?: string | null;
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
  allowTypeSelection = false,
  fields = EMPTY_FIELDS,
  builtinLayout = null,
  seed,
  moduleId = null,
  onClose,
  onSave,
  onUpload,
}: TProps) => {
  const { t } = useTranslation();
  const [builtin, setBuiltin] = useState<TRequirementBuiltinValues>(createEmptyBuiltinValues);
  const [data, setData] = useState<TRequirementData>({});
  /** 库条目手填编号（必填非空、库内唯一）；产品作用域不渲染也不发送 */
  const [codeDraft, setCodeDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 弹窗里传上去的资源。取消建行就得删掉，否则留一堆没有归属的孤儿文件 */
  const [pendingAssetIds, setPendingAssetIds] = useState<string[]>([]);
  /** 选中的类型。有选择器时由用户改，没有时恒等于传进来的 requirementTypeId */
  const [typeId, setTypeId] = useState<string | null>(requirementTypeId ?? null);
  /** data 里那批值是按哪个类型的字段建的 —— 换类型要整批作废，两个类型的 field.id 不是一套 */
  const [dataTypeId, setDataTypeId] = useState<string | null>(requirementTypeId ?? null);
  /**
   * 第几次打开。网格那边这个弹窗是常驻挂载的（只切 isOpen），而富文本编辑器的
   * initialValue 钉死在挂载那一帧 —— 不拿它当 key，复制行带过来的描述永远进不去编辑器。
   */
  const [openSeq, setOpenSeq] = useState(0);

  /**
   * 可选类型 = 工作区里所有启用的类型，不是产品配置里那份 —— 后者只含「这个产品下已经
   * 有行」的类型，拿它当候选就永远建不出某个类型的第一条需求。弹窗关着时不发这个请求。
   */
  const { requirementTypes } = useRequirementTypes(allowTypeSelection ? workspaceSlug : undefined);
  const selectableTypes = useMemo(
    () => requirementTypes.filter((requirementType) => requirementType.is_active),
    [requirementTypes]
  );
  const {
    fields: selectedTypeFields,
    builtinFields: selectedTypeBuiltinFields,
    isLoading: isFieldsLoading,
  } = useRequirementTypeFields(workspaceSlug, allowTypeSelection ? typeId : undefined);

  /**
   * 底部属性条上的内置列 = 内置列去掉标题、描述与状态，顺序按类型布局。
   *
   * 标题和描述在上面占主区，是这条需求的内容本身；状态不走内容载荷（BuiltinCellEditor
   * 对它只渲染只读值），后端建行时一律落 not_started，之后在网格 / 详情里单独改 ——
   * 摆一个改不动的字段是噪音。剩下的优先级/负责人/起止日期/父项才是「元数据」，归到底部。
   */
  const effectiveBuiltinLayout = allowTypeSelection ? selectedTypeBuiltinFields : builtinLayout;
  const propertyColumns = useMemo(
    () =>
      resolveBuiltinColumns(entityKind, effectiveBuiltinLayout).filter(
        (entry) => !["description_html", "status"].includes(entry.key)
      ),
    [entityKind, effectiveBuiltinLayout]
  );
  const visibleFields = useMemo(
    () => (allowTypeSelection ? selectedTypeFields : fields).filter((field) => field.is_active),
    [allowTypeSelection, selectedTypeFields, fields]
  );
  // 与详情页同构：叶子字段走标签+控件行，form 字段交给 RequirementSubformSection
  const leafFields = useMemo(
    () => visibleFields.filter((field) => field.field_type !== "form"),
    [visibleFields]
  );
  const formFields = useMemo(
    () => visibleFields.filter((field) => field.field_type === "form"),
    [visibleFields]
  );

  useEffect(() => {
    if (!isOpen) return;
    setBuiltin(seed?.builtin ? { ...seed.builtin } : createEmptyBuiltinValues());
    setData(seed?.data ? cloneDeep(seed.data) : createEmptyRequirementData(visibleFields));
    // 编号每次打开都留空让用户填 —— 复制行也不带：编号库内唯一，抄过来必撞
    setCodeDraft("");
    setTypeId(requirementTypeId ?? null);
    setDataTypeId(requirementTypeId ?? null);
    setPendingAssetIds([]);
    setError(null);
    setOpenSeq((sequence) => sequence + 1);
    // seed 只在打开的那一刻取一次快照；开着的时候源行变了不该把用户填了一半的值冲掉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /*
   * 换类型（含首次选中）后把自定义字段整批换成新类型的空值。内置字段留着 —— 标题、
   * 描述、负责人这些在哪个类型下都是同一列，填了一半不该因为换了个类型就被清掉。
   */
  useEffect(() => {
    if (!isOpen || !allowTypeSelection) return;
    if (isFieldsLoading || typeId === dataTypeId) return;
    setData(createEmptyRequirementData(visibleFields));
    setDataTypeId(typeId);
  }, [isOpen, allowTypeSelection, isFieldsLoading, typeId, dataTypeId, visibleFields]);

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
            ...(typeId ? { requirement_type_id: typeId } : {}),
            ...(seed?.beforeId ? { before_id: seed.beforeId } : {}),
            ...(seed?.afterId ? { after_id: seed.afterId } : {}),
            ...(moduleId ? { module_id: moduleId } : {}),
            // 库条目编号必填（服务端 REQUIREMENT_CODE_REQUIRED），产品路径不发
            ...(entityKind === "library" ? { code: codeDraft.trim() } : {}),
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
      // 编号错误码埋在批量序列化器的嵌套结构里，整体检索后翻译成人话
      const raw = JSON.stringify(submitError ?? {});
      const codeError = raw.includes("REQUIREMENT_CODE_ALREADY_EXISTS")
        ? t("requirements.identifier.code_duplicate")
        : raw.includes("REQUIREMENT_CODE_REQUIRED")
          ? t("requirements.identifier.code_required")
          : null;
      setError(codeError ?? payload?.error ?? payload?.detail ?? t("workspace_products.requirements.toast.failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isTitleEmpty = !builtin.title.trim();
  /** 有选择器时类型是必填的第一个字段 —— 没选之前后端也接不了这一行 */
  const isTypeMissing = allowTypeSelection && !typeId;
  /** 库条目编号手填必填 —— 空着后端也会拒（REQUIREMENT_CODE_REQUIRED） */
  const isCodeMissing = entityKind === "library" && !codeDraft.trim();

  const parentScope =
    entityKind === "product" ? { workspaceSlug, productId: entityId } : { workspaceSlug, libraryId: entityId };
  const patchBuiltin = (patch: Partial<TRequirementBuiltinValues>) =>
    setBuiltin((current) => ({ ...current, ...patch }));

  /*
    三段式，与工作项创建弹窗（IssueFormRoot / BugIssueFormRoot）同构：

      头部（不滚动）  标题文案 + 类型 + 标题输入 —— 「这是什么」
      正文（滚动）    描述 + 该类型的字段 —— 「内容」
      底部（不滚动）  属性胶囊条 + 动作 —— 「元数据」

    视觉细节（字号、边框、描述容器、字段行、页脚间距）也按工作项创建弹窗对齐，
    避免两边「同构图、不同皮」。
  */
  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXXL}>
      <div className="flex max-h-[min(85vh,56rem)] min-h-0 w-full flex-col">
        <div className="flex-shrink-0 rounded-t-lg bg-surface-1 p-5">
          <h3 className="pb-2 text-h4-medium text-secondary">{t("requirement_grid.data.add")}</h3>
          {/* 类型是表单的第一个字段，不再是进表单前的一道关卡 —— 与工作项创建弹窗一致 */}
          {allowTypeSelection && (
            <div className="flex items-center pt-2 pb-4">
              <RequirementTypeSelect types={selectableTypes} value={typeId} onChange={setTypeId} />
            </div>
          )}
          {/* 库条目编号手填必填：放在标题上方，与列顺序（编号在前）一致 */}
          {entityKind === "library" && (
            <div className="pb-2">
              <Input
                id="requirement-create-code"
                type="text"
                value={codeDraft}
                onChange={(event) => setCodeDraft(event.target.value)}
                maxLength={255}
                placeholder={t("requirements.identifier.code_placeholder")}
                className="w-full text-body-sm-regular"
              />
            </div>
          )}
          <div className={cn("space-y-1", !allowTypeSelection && "pt-2")}>
            {/*
              常驻挂载时 autoFocus 只在首次生效，用 openSeq 重挂才能每次打开都把光标送进标题。
              控件本身用 @plane/ui Input，与工作项创建弹窗的 IssueTitleInput 同皮。
            */}
            <Input
              key={openSeq}
              id="requirement-create-title"
              type="text"
              value={builtin.title}
              onChange={(event) => patchBuiltin({ title: event.target.value })}
              maxLength={255}
              placeholder={t("requirement_grid.data.title_placeholder")}
              className="w-full text-body-sm-regular"
              autoFocus
            />
          </div>
        </div>

        <div
          data-modal-wheel-scroll
          className="scrollbar-sm vertical-scrollbar min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto bg-surface-1 pb-4"
        >
          {/*
            描述用内联编辑器，不用网格那个「点开再进一层弹窗」的摘要按钮。
            外层容器与工作项创建弹窗的 IssueDescriptionEditor 同皮。
          */}
          <div className="px-5">
            <div className="relative rounded-lg border-[0.5px] border-subtle-1 bg-layer-2">
              <RequirementRichTextField
                key={openSeq}
                workspaceSlug={workspaceSlug}
                entityId={entityId}
                editorId={`requirement-create-description-${entityId}-${openSeq}`}
                value={builtin.description_html}
                onChange={(html) => patchBuiltin({ description_html: html })}
                onAssetUpload={registerAsset}
                deferAssetDeletion
                placeholder={t("requirement_grid.data.description_placeholder")}
                containerClassName="min-h-[120px] pt-3"
              />
            </div>
          </div>

          {/* 自定义字段随类型走：取字段定义时占一块骨架，没选类型时给一句提示 */}
          <div className="px-5">
            {allowTypeSelection && isFieldsLoading && (
              <Loader className="space-y-3">
                <Loader.Item height="32px" />
                <Loader.Item height="32px" />
              </Loader>
            )}

            {allowTypeSelection && !isFieldsLoading && !typeId && (
              <p className="rounded-md bg-layer-1 px-3 py-2.5 text-12 text-secondary">
                {t("requirement_grid.data.pick_type_hint")}
              </p>
            )}

            {leafFields.length > 0 && (
              <div className="flex flex-col">
                {leafFields.map((field) => {
                  const FieldIcon = CREATE_MODAL_FIELD_ICONS[field.field_type];
                  return (
                    <div key={field.id} className="flex items-center gap-0 py-1.5">
                      {/*
                        标签 class 必须写成字面量，不能包进 cn()：
                        项目里的 twMerge 会把 text-sm 和 text-secondary 判成冲突，丢掉 text-sm，
                        标签就会落到浏览器默认 16px（工作项 ExtraFieldRow 也是字面量，所以没这问题）。
                      */}
                      <label className="flex w-1/4 shrink-0 items-center gap-1.5 text-sm text-secondary">
                        <FieldIcon className="h-3.5 w-3.5 shrink-0 text-tertiary" />
                        <span className="truncate">{field.name}</span>
                        {field.is_required && <span className="text-danger-primary">*</span>}
                      </label>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
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
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* form 字段不能走 LeafEditor（会退化成普通文本框），复用详情页同一套子表 */}
            {formFields.length > 0 && (
              <div className={cn(leafFields.length > 0 && "pt-2")}>
                <RequirementSubformSection
                  forms={formFields}
                  data={data}
                  workspaceSlug={workspaceSlug}
                  entityId={entityId}
                  readOnly={false}
                  defaultOpenCount={formFields.length}
                  defaultOpenEmpty
                  storageKey={`requirement-create:subforms:${typeId ?? entityId}`}
                  onChange={setData}
                  onUpload={handleUpload}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 rounded-b-lg border-t-[0.5px] border-subtle bg-surface-1 px-4 py-3">
          {/* 属性条：与工作项创建弹窗底部同一排胶囊，宽度随内容、换行不换结构 */}
          <div className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              {propertyColumns.map((column) => (
                <div key={column.key} className="h-7">
                  <BuiltinCellEditor
                    variant="chip"
                    columnKey={column.key}
                    values={builtin}
                    onChange={patchBuiltin}
                    parentScope={parentScope}
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <p className="pb-3 text-12 text-danger-primary">{error}</p>}

          <div className="flex items-center justify-end gap-4 border-t-[0.5px] border-subtle pt-6 pb-3">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="lg" onClick={handleClose} disabled={isSubmitting}>
                {t("discard")}
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting || isTitleEmpty || isTypeMissing || isCodeMissing || isFieldsLoading}
                loading={isSubmitting}
              >
                {t("save")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ModalCore>
  );
};
