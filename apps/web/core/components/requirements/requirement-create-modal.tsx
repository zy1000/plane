"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { cloneDeep } from "lodash-es";
import { AlertCircle, AlignLeft, Check, Hash, Library, Package, Shapes, Type, X } from "lucide-react";
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
import { BuiltinCellEditor, createEmptyBuiltinValues } from "./requirement-builtin-fields";
import { resolveBuiltinColumns } from "./requirement-builtin-layout";
import { FIELD_ICONS } from "./requirement-field-builder";
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
  onClose: () => void;
  onSave: (payload: TRequirementBatchSavePayload) => Promise<TRequirementBatchSaveResponse>;
  onUpload: (file: globalThis.File, imageOnly: boolean) => Promise<TRequirementAssetRef>;
};

type TRequiredEntry = { key: string; label: string; missing: boolean };

/** 分组标题：文字 + 一条细线，后面可以跟一句来源说明（「来自需求类型 X」） */
const FormSection = ({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) => (
  <section className="flex flex-col gap-3 pt-4">
    {title && (
      <div className="flex items-center gap-2.5 text-12 font-semibold text-secondary">
        <span className="shrink-0">{title}</span>
        {subtitle && <span className="truncate font-normal text-tertiary">{subtitle}</span>}
        <span aria-hidden className="h-0 min-w-4 flex-1 border-t-[0.5px] border-subtle" />
      </div>
    )}
    {children}
  </section>
);

/**
 * 一个字段：标签（图标 + 名字 + 必填星号 / 选填）、控件、下方一行说明或错误。
 * onBlur 挂在外层：控件失焦（含下拉关掉）冒泡到这里，调用方据此把字段标成「碰过」。
 */
const ModalField = ({
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
      {/*
        必填 / 有 hint 的字段常驻占一行（11px 字 + leading-4 ≈ 16px），避免失焦报错
        插入 DOM 后把弹窗撑高、下面字段跟着跳。
      */}
      {(error || hint || required) && (
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
            (hint ?? "\u00a0")
          )}
        </p>
      )}
    </div>
  );
};

/** 底部左下角的必填进度：n / 总数 + 还差哪几项；全填完变绿，这也是保存按钮为什么灰的解释 */
const RequiredProgress = ({ entries }: { entries: TRequiredEntry[] }) => {
  const { t } = useTranslation();
  const missing = entries.filter((entry) => entry.missing);
  const filled = entries.length - missing.length;
  if (missing.length === 0) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-12 text-secondary">
        <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-success-subtle px-2 text-11 font-semibold text-success-primary tabular-nums">
          <Check className="size-3" />
          {filled} / {entries.length}
        </span>
        <span>{t("requirement_grid.data.required_done")}</span>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2 text-12 text-secondary">
      <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-danger-subtle px-2 text-11 font-semibold text-danger-primary tabular-nums">
        {filled} / {entries.length}
      </span>
      {missing.length === entries.length ? (
        <span>{t("requirement_grid.data.required_progress_all", { count: missing.length })}</span>
      ) : (
        <span className="truncate">
          {t("requirement_grid.data.required_missing_prefix")}
          <span className="font-medium text-primary">
            {missing.map((entry) => entry.label).join(t("requirement_grid.data.required_separator"))}
          </span>
        </span>
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
  context,
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
   * 用户碰过（失焦过）的必填字段。行内错误只在「碰过又留空」时出现 —— 刚打开就满屏
   * 飘红等于没有提示；没碰过的缺项由底部进度条兜底。
   */
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const touch = useCallback(
    (key: string) => setTouched((current) => (current.has(key) ? current : new Set(current).add(key))),
    []
  );

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
  /** 标题栏与「需求属性」分组里提到的类型名：有选择器时跟着选中项走，否则由调用方给 */
  const typeName = allowTypeSelection
    ? selectableTypes.find((requirementType) => requirementType.id === typeId)?.name
    : context?.typeName;

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

  /**
   * 必填清单：类型（有选择器时）、编号（库）、标题，再加该类型里 is_required 的自定义字段
   * —— 叶子按值判空，子表按「至少一行」，口径与后端 enforce_required 一致。
   * 保存按钮由它决定，底部进度条靠它说「还差什么」。字段随类型配置走，这里不认任何字段名。
   */
  const requiredEntries = useMemo<TRequiredEntry[]>(() => {
    const entries: TRequiredEntry[] = [];
    if (allowTypeSelection) {
      entries.push({ key: "type", label: t("requirement_detail.requirement_type"), missing: !typeId });
    }
    if (entityKind === "library") {
      entries.push({ key: "code", label: t("requirements.identifier.column"), missing: !codeDraft.trim() });
    }
    entries.push({ key: "title", label: t("requirement_fields.builtin.title"), missing: !builtin.title.trim() });
    for (const field of visibleFields) {
      if (!field.is_required) continue;
      entries.push({ key: field.id, label: field.name, missing: isRequirementValueEmpty(field, data[field.id]) });
    }
    return entries;
  }, [allowTypeSelection, builtin.title, codeDraft, data, entityKind, t, typeId, visibleFields]);
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

  const EntityIcon = entityKind === "library" ? Library : Package;

  /*
    三段式，与工作项创建弹窗（IssueFormRoot / BugIssueFormRoot）同构：

      头部（不滚动）  标题 —— 「这是什么」
      正文（滚动）    基本信息（编号、标题、描述）→ 需求属性（该类型的字段）→ 子表 —— 「内容」
      底部（不滚动）  属性胶囊条 + 必填进度 + 动作 —— 「元数据」

    必填分三层表达：标签星号常驻、失焦后行内报错、底部进度兜底，三层同一套红色。
  */
  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXXL}>
      <div className="flex max-h-[min(85vh,56rem)] min-h-0 w-full flex-col">
        <div className="flex flex-shrink-0 items-center justify-between gap-4 rounded-t-lg border-b-[0.5px] border-subtle bg-surface-1 px-5 pt-4 pb-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent-primary">
              <EntityIcon className="size-[17px]" />
            </div>
            <h3 className="text-16 leading-tight font-semibold text-primary">{t("requirement_grid.data.add")}</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("close")}
            className="grid size-7 shrink-0 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
          >
            <X className="size-4" />
          </button>
        </div>

        <div
          data-modal-wheel-scroll
          className="scrollbar-sm vertical-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-surface-1 px-5 pb-5"
        >
          <FormSection title={t("requirement_grid.data.basic_section")}>
            {/* 类型是表单的第一个字段，不再是进表单前的一道关卡 —— 与工作项创建弹窗一致 */}
            {allowTypeSelection && (
              <ModalField label={t("requirement_detail.requirement_type")} icon={Shapes} required>
                <RequirementTypeSelect types={selectableTypes} value={typeId} onChange={setTypeId} />
              </ModalField>
            )}
            {/* 库条目编号手填必填：与标题同排、放在前面，与列顺序（编号在前）一致 */}
            <div
              className={cn(
                "grid gap-3.5",
                entityKind === "library" ? "grid-cols-[220px_minmax(0,1fr)]" : "grid-cols-1"
              )}
            >
              {entityKind === "library" && (
                <ModalField
                  label={t("requirements.identifier.column")}
                  icon={Hash}
                  required
                  error={showError("code") ? t("requirements.identifier.code_required") : undefined}
                  onBlur={() => touch("code")}
                >
                  <Input
                    id="requirement-create-code"
                    type="text"
                    value={codeDraft}
                    onChange={(event) => setCodeDraft(event.target.value)}
                    maxLength={255}
                    hasError={showError("code")}
                    className="w-full text-body-sm-regular"
                  />
                </ModalField>
              )}
              <ModalField
                label={t("requirement_fields.builtin.title")}
                icon={Type}
                required
                error={showError("title") ? t("requirement_grid.data.title_required") : undefined}
                onBlur={() => touch("title")}
              >
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
                  hasError={showError("title")}
                  className="w-full text-body-sm-regular"
                  autoFocus
                />
              </ModalField>
            </div>
            {/*
              描述用内联编辑器，不用网格那个「点开再进一层弹窗」的摘要按钮。
              外层容器与工作项创建弹窗的 IssueDescriptionEditor 同皮。
            */}
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
                  containerClassName="min-h-[96px] pt-3"
                />
              </div>
            </ModalField>
          </FormSection>

          {/* 自定义字段随类型走：取字段定义时占一块骨架，没选类型时给一句提示 */}
          {allowTypeSelection && isFieldsLoading && (
            <Loader className="space-y-3 pt-4">
              <Loader.Item height="32px" />
              <Loader.Item height="32px" />
            </Loader>
          )}

          {allowTypeSelection && !isFieldsLoading && !typeId && (
            <p className="mt-4 rounded-md bg-layer-1 px-3 py-2.5 text-12 text-secondary">
              {t("requirement_grid.data.pick_type_hint")}
            </p>
          )}

          {leafFields.length > 0 && (
            <FormSection
              title={t("requirement_grid.data.attributes_section")}
              subtitle={typeName ? t("requirement_grid.data.attributes_from_type", { type: typeName }) : undefined}
            >
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
                      {/* LeafEditor 自带 0.5px 细边，错误态在外层再描一圈红 ring，不进它的分支里改 */}
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

          {/* form 字段不能走 LeafEditor（会退化成普通文本框），复用详情页同一套子表 */}
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

        <div className="flex-shrink-0 rounded-b-lg border-t-[0.5px] border-subtle bg-surface-1 px-4 pt-3 pb-3.5">
          {/*
            属性条：与工作项创建弹窗底部同一排胶囊，宽度随内容、换行不换结构。
            每颗胶囊 = 字段名标签 + 控件，「None」「选择父项」这种光秃秃的值不再出现。
          */}
          <div className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              {propertyColumns.map((column) => {
                const ColumnIcon = column.column.icon;
                return (
                  <div key={column.key} className="flex h-7 items-center overflow-hidden rounded-md border border-strong">
                    <span className="flex h-full shrink-0 items-center gap-1.5 border-r border-strong bg-layer-1 px-2 text-12 text-secondary">
                      <ColumnIcon className="size-3.5 text-tertiary" />
                      {t(column.column.labelKey)}
                    </span>
                    <BuiltinCellEditor
                      variant="chip"
                      columnKey={column.key}
                      values={builtin}
                      onChange={patchBuiltin}
                      parentScope={parentScope}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {error && <p className="pb-3 text-12 text-danger-primary">{error}</p>}

          <div className="flex items-center justify-between gap-4 border-t-[0.5px] border-subtle pt-3">
            <RequiredProgress entries={requiredEntries} />
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" size="lg" onClick={handleClose} disabled={isSubmitting}>
                {t("discard")}
              </Button>
              {/* 必填没齐就禁用，底部进度条负责解释为什么 —— 不让人点了再看后端报错 */}
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
        </div>
      </div>
    </ModalCore>
  );
};
