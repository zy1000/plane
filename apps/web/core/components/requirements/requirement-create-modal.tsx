"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cloneDeep } from "lodash-es";
import { AlertCircle, AlignLeft, Hash, Shapes, Type, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { createEmptyBuiltinValues } from "./requirement-builtin-fields";
import { resolveBuiltinColumns } from "./requirement-builtin-layout";
import {
  RequirementCreatePropertyRail,
  type TCreateRequiredEntry,
} from "./requirement-create-property-rail";
import { FIELD_ICONS } from "./requirement-builder-items";
import { RequirementSubformSection } from "./requirement-detail/requirement-subform-section";
import { isRequirementValueEmpty } from "./requirement-required";
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

/** 两列网格里独占一整行的字段类型：富文本与附件本身就是一块，挤进半列会变成一条缝 */
const FULL_WIDTH_FIELD_TYPES = new Set<TRequirementField["field_type"]>(["rich_text", "attachment", "image"]);

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

/** 标题栏下那行上下文：加到哪个库 / 产品、用的哪个需求类型。都可缺省 */
export type TRequirementCreateContext = {
  entityName?: string;
  typeName?: string;
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
  /** 标题栏下的上下文。allowTypeSelection 时类型名随选中类型自取，只用 entityName */
  context?: TRequirementCreateContext;
  seed?: TRequirementCreateSeed;
  /** 左侧模块树的当前选中：弹窗建出的行自动挂进该模块 */
  moduleId?: string | null;
  /** 当前选中模块的名字，打开时回显用；不传则只靠 id，下拉打开后再补 */
  moduleName?: string | null;
  onClose: () => void;
  onSave: (payload: TRequirementBatchSavePayload) => Promise<TRequirementBatchSaveResponse>;
  onUpload: (file: globalThis.File, imageOnly: boolean) => Promise<TRequirementAssetRef>;
};

const FormSection = ({ children }: { children: ReactNode }) => (
  <section className="flex min-w-0 flex-col gap-3 pt-4">{children}</section>
);

/**
 * 一个字段：标签（图标 + 名字 + 必填星号 / 选填）、控件、下方一行说明或错误。
 * onBlur 挂在外层：控件失焦（含下拉关掉）冒泡到这里，调用方据此把字段标成「碰过」。
 */
const ModalField = ({
  htmlFor,
  label,
  icon: Icon,
  required = false,
  optional = false,
  hint,
  error,
  className,
  onBlur,
  children,
}: {
  htmlFor?: string;
  label: string;
  icon?: LucideIcon;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  onBlur?: () => void;
  children: ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)} onBlur={onBlur}>
      {/*
        标签 class 必须写成字面量，不能包进 cn()：项目里的 twMerge 会把 text-12 和
        text-primary 判成冲突，丢掉 text-12（工作项 ExtraFieldRow 也是字面量，所以没这问题）。
      */}
      <label
        htmlFor={htmlFor}
        className={
          error
            ? "flex items-center gap-1.5 text-12 leading-4 font-medium text-danger-secondary"
            : "flex items-center gap-1.5 text-12 leading-4 font-medium text-primary"
        }
      >
        {Icon && <Icon className="size-3.5 shrink-0 text-tertiary" />}
        <span className="truncate">{label}</span>
        {required && <span className="shrink-0 font-bold text-danger-primary">*</span>}
        {optional && <span className="shrink-0 text-11 font-normal text-tertiary">{t("requirement_grid.data.optional")}</span>}
      </label>
      {children}
      {(error || hint) && (
        <p
          className={cn(
            "flex min-h-4 items-center gap-1 text-11 leading-4",
            error ? "text-danger-secondary" : "text-tertiary"
          )}
        >
          {error ? (
            <>
              <AlertCircle className="size-3 shrink-0 text-danger-primary" />
              {error}
            </>
          ) : (
            hint
          )}
        </p>
      )}
    </div>
  );
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
  moduleName = null,
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
   * 用户碰过（失焦过）的必填字段。行内错误只在「碰过又留空」时出现 —— 刚打开就满屏
   * 飘红等于没有提示；没碰过的缺项由右栏清单兜底。
   */
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  /** 模块是旁路挂靠，不进内置字段。打开时跟侧栏，之后以用户在右栏改的为准 */
  const [draftModuleId, setDraftModuleId] = useState<string | null>(moduleId);
  const [draftModuleName, setDraftModuleName] = useState<string | null>(moduleName);
  const touch = useCallback(
    (key: string) => setTouched((current) => (current.has(key) ? current : new Set(current).add(key))),
    []
  );
  const titleInputRef = useRef<HTMLInputElement>(null);
  const typeFocusRef = useRef<HTMLElement | null>(null);
  const bindTypeFocus = useCallback((node: HTMLDivElement | null) => {
    typeFocusRef.current = node?.querySelector("button") ?? null;
  }, []);

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
   * 右栏属性轨上的内置列 = 内置列去掉标题、描述与状态，顺序按类型布局。
   *
   * 标题和描述在左栏，是这条需求的内容本身；状态不走内容载荷（BuiltinCellEditor
   * 对它只渲染只读值），后端建行时一律落 not_started，之后在网格 / 详情里单独改 ——
   * 摆一个改不动的字段是噪音。剩下的优先级/负责人/起止日期/父项才是「元数据」。
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
    setTouched(new Set());
    setDraftModuleId(moduleId ?? null);
    setDraftModuleName(moduleName ?? null);
    setError(null);
    setOpenSeq((sequence) => sequence + 1);
    // seed 只在打开的那一刻取一次快照；开着的时候源行变了不该把用户填了一半的值冲掉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // 打开后把焦点送到类型（总览）或标题（类型已锁定）。initialFocus 可能赶上
  // 类型按钮还没绑上 ref，下一帧再补一次，避免回车误关弹窗。
  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const target = allowTypeSelection ? typeFocusRef.current : titleInputRef.current;
      target?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, allowTypeSelection, openSeq]);

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
            ...(draftModuleId ? { module_id: draftModuleId } : {}),
            // 库条目编号选填：留空由服务端补「库标识-序号」占位编号；产品路径不发
            ...(entityKind === "library" && codeDraft.trim() ? { code: codeDraft.trim() } : {}),
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
        : null;
      setError(codeError ?? payload?.error ?? payload?.detail ?? t("workspace_products.requirements.toast.failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * 必填清单：类型（有选择器时）、标题，再加该类型里 is_required 的自定义字段
   * —— 叶子按值判空，子表按「至少一行」，口径与后端 enforce_required 一致。
   * 保存按钮由它决定，右栏清单靠它说「还差什么」。字段随类型配置走，这里不认任何字段名。
   * 库条目编号不在其中：留空由服务端补占位编号。
   */
  const requiredEntries = useMemo<TCreateRequiredEntry[]>(() => {
    const entries: TCreateRequiredEntry[] = [];
    if (allowTypeSelection) {
      entries.push({ key: "type", label: t("requirement_detail.requirement_type"), missing: !typeId });
    }
    entries.push({ key: "title", label: t("requirement_fields.builtin.title"), missing: !builtin.title.trim() });
    for (const field of visibleFields) {
      if (!field.is_required) continue;
      entries.push({ key: field.id, label: field.name, missing: isRequirementValueEmpty(field, data[field.id]) });
    }
    return entries;
  }, [allowTypeSelection, builtin.title, data, t, typeId, visibleFields]);
  const missingKeys = useMemo(
    () => new Set(requiredEntries.filter((entry) => entry.missing).map((entry) => entry.key)),
    [requiredEntries]
  );
  /** 行内报错只给「碰过又留空」的字段 */
  const showError = (key: string) => touched.has(key) && missingKeys.has(key);
  const leafErrorMessage = (field: TRequirementField) =>
    field.field_type === "select" || field.field_type === "member"
      ? t("requirement_grid.data.select_required", { field: field.name })
      : t("requirement_grid.data.field_required", { field: field.name });

  const parentScope =
    entityKind === "product" ? { workspaceSlug, productId: entityId } : { workspaceSlug, libraryId: entityId };
  const patchBuiltin = (patch: Partial<TRequirementBuiltinValues>) =>
    setBuiltin((current) => ({ ...current, ...patch }));

  /*
    左右档案：

      头部（不滚动）  标题 —— 「这是什么」
      左栏（滚动）    类型、编号、标题、描述、该类型字段、子表 —— 「内容」
      右栏（粘住）    属性轨 + 待完成清单 —— 「元数据」
      底部（不滚动）  放弃 / 保存

    必填：标签星号常驻、失焦后行内报错、右栏清单兜底。打开态不亮红灯。
  */
  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.TOP}
      width={EModalWidth.VXL}
      initialFocus={allowTypeSelection ? typeFocusRef : titleInputRef}
    >
      <div className="flex max-h-[min(85vh,56rem)] min-h-0 w-full flex-col">
        <div className="flex flex-shrink-0 items-center justify-between gap-4 rounded-t-lg border-b-[0.5px] border-subtle bg-surface-1 px-5 pt-4 pb-3.5">
          <h3 className="text-16 leading-tight font-semibold text-primary">{t("requirement_grid.data.add")}</h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("close")}
            className="grid size-7 shrink-0 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex min-h-[min(28rem,50vh)] min-w-0 flex-1 flex-col md:flex-row">
          <div
            data-modal-wheel-scroll
            className="scrollbar-sm vertical-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-surface-1 px-5 pb-5"
          >
            <FormSection>
              {allowTypeSelection && (
                <ModalField
                  label={t("requirement_detail.requirement_type")}
                  icon={Shapes}
                  required
                  hint={t("requirement_grid.data.pick_type_hint")}
                >
                  <div ref={bindTypeFocus}>
                    <RequirementTypeSelect types={selectableTypes} value={typeId} onChange={setTypeId} />
                  </div>
                </ModalField>
              )}
              <div
                className={cn(
                  "grid gap-3.5",
                  entityKind === "library" ? "grid-cols-[220px_minmax(0,1fr)]" : "grid-cols-1"
                )}
              >
                {entityKind === "library" && (
                  <ModalField htmlFor="requirement-create-code" label={t("requirements.identifier.column")} icon={Hash}>
                    <Input
                      id="requirement-create-code"
                      type="text"
                      value={codeDraft}
                      onChange={(event) => setCodeDraft(event.target.value)}
                      maxLength={255}
                      placeholder={t("requirements.identifier.code_optional_placeholder")}
                      className="w-full text-body-sm-regular"
                    />
                  </ModalField>
                )}
                <ModalField
                  htmlFor="requirement-create-title"
                  label={t("requirement_fields.builtin.title")}
                  icon={Type}
                  required
                  error={showError("title") ? t("requirement_grid.data.title_required") : undefined}
                  onBlur={() => touch("title")}
                >
                  <Input
                    key={openSeq}
                    ref={titleInputRef}
                    id="requirement-create-title"
                    type="text"
                    value={builtin.title}
                    onChange={(event) => patchBuiltin({ title: event.target.value })}
                    onBlur={() => touch("title")}
                    maxLength={255}
                    hasError={showError("title")}
                    aria-invalid={showError("title")}
                    placeholder={t("requirement_grid.data.title_placeholder")}
                    className="w-full text-body-sm-regular"
                  />
                </ModalField>
              </div>
              <ModalField label={t("requirement_fields.builtin.description")} icon={AlignLeft} optional>
                <div className="relative rounded-md border-[0.5px] border-subtle-1 bg-layer-2">
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
                    containerClassName="min-h-[72px] pt-3"
                  />
                </div>
              </ModalField>
            </FormSection>

            {allowTypeSelection && isFieldsLoading && (
              <Loader className="space-y-3 pt-4">
                <Loader.Item height="32px" />
                <Loader.Item height="32px" />
              </Loader>
            )}

            {leafFields.length > 0 && (
              <FormSection>
                <div className="grid grid-cols-2 gap-x-3.5 gap-y-3">
                  {leafFields.map((field) => {
                    const invalid = showError(field.id);
                    return (
                      <ModalField
                        key={field.id}
                        label={field.name}
                        icon={CREATE_MODAL_FIELD_ICONS[field.field_type]}
                        required={field.is_required}
                        error={invalid ? leafErrorMessage(field) : undefined}
                        className={FULL_WIDTH_FIELD_TYPES.has(field.field_type) ? "col-span-2" : undefined}
                        onBlur={field.is_required ? () => touch(field.id) : undefined}
                      >
                        <div className={cn("min-w-0", invalid && "rounded-md ring-1 ring-danger-strong")}>
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
                      </ModalField>
                    );
                  })}
                </div>
              </FormSection>
            )}

            {formFields.length > 0 && (
              <FormSection>
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
              </FormSection>
            )}
          </div>

          <RequirementCreatePropertyRail
            propertyColumns={propertyColumns}
            builtin={builtin}
            onChange={patchBuiltin}
            parentScope={parentScope}
            moduleId={draftModuleId}
            moduleName={draftModuleName}
            onModuleChange={(nextId, nextName) => {
              setDraftModuleId(nextId);
              setDraftModuleName(nextName);
            }}
            requiredEntries={requiredEntries}
            touched={touched}
          />
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2 rounded-b-lg border-t-[0.5px] border-subtle bg-surface-1 px-5 py-3">
          {error && <p className="mr-auto text-12 text-danger-primary">{error}</p>}
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={isSubmitting}>
            {t("discard")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || isFieldsLoading || missingKeys.size > 0}
            loading={isSubmitting}
          >
            {t("save")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
