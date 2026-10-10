import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { AlertCircle, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TStageReviewTemplate } from "@plane/types";
import {
  EStageReviewKind,
  STAGE_REVIEW_ACTIVITY_KIND_BY_ROOT,
  STAGE_REVIEW_ACTIVITY_KINDS,
  STAGE_REVIEW_ROOT_KINDS,
} from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn, isEmptyHtmlString } from "@plane/utils";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { WorkspaceService } from "@/services/workspace.service";
import { StageReviewKindBadge } from "./stage-review-kind-badge";

export type TStageReviewFormValue = {
  kind: EStageReviewKind;
  /** null = 直接归属阶段（有些阶段没有汇总评审，活动本身就是顶层项） */
  parent_id: string | null;
  title: string;
  /** 标准编号：必填，工作区内唯一；生成评审时快照到评审上 */
  standard_code: string;
  /** 富文本 HTML —— 裁剪表生效生成评审实例时原样抄到 StageReview.description_html */
  description_html: string;
  initiator_role: string;
  leader_role: string;
  auditor_role: string;
};

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  /** 编辑已有节点；为空即新建 */
  template: TStageReviewTemplate | null;
  /** 本阶段的根评审，作为「归属」的候选（按族过滤后展示） */
  stageRoots: TStageReviewTemplate[];
  /** 从某条评审的 ＋ 进来时的预选父级 */
  defaultParent: TStageReviewTemplate | null;
  /** 工作区全部模板节点：标准编号工作区内唯一，提交前先在本地查重，能说出被哪个节点占了 */
  allTemplates: TStageReviewTemplate[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (value: TStageReviewFormValue) => Promise<unknown>;
};

const workspaceService = new WorkspaceService();
const EMPTY_DESCRIPTION = "<p></p>";
const I18N = "workspace_templates.reviews";

const KIND_OPTIONS = [
  EStageReviewKind.REVIEW,
  EStageReviewKind.ACTIVITY,
  EStageReviewKind.O_STAGE_REVIEW,
  EStageReviewKind.O_STAGE_ACTIVITY,
];

const INPUT_CLASS =
  "h-9 w-full rounded-md border border-subtle bg-surface-1 px-2.5 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong";

type TErrorField = "title" | "standard_code" | null;

/** 后端把标准编号的错误码放在字段消息里，例如 {standard_code: ["STAGE_REVIEW_TEMPLATE_CODE_ALREADY_EXISTS"]} */
const CODE_ERROR_PREFIX = "STAGE_REVIEW_TEMPLATE_CODE_";

/** 该活动类型能挂在哪些根类型下（父子必须同族） */
const rootKindFor = (activityKind: EStageReviewKind): EStageReviewKind | null => {
  const entry = Object.entries(STAGE_REVIEW_ACTIVITY_KIND_BY_ROOT).find(([, child]) => child === activityKind);
  return (entry?.[0] as EStageReviewKind) ?? null;
};

// observer：workspaceId 取自 MobX 的工作区 store，数据晚到时要能把编辑器从骨架切出来
export const StageReviewTemplateFormModal = observer(function StageReviewTemplateFormModal(props: Props) {
  const { isOpen, workspaceSlug, template, stageRoots, defaultParent, allTemplates, isSubmitting, onClose, onSubmit } =
    props;
  const { t } = useTranslation();
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString();
  // 描述单独拿出来：编辑器自己管内容，只在提交时取一次
  const [value, setValue] = useState<Omit<TStageReviewFormValue, "description_html">>({
    kind: EStageReviewKind.REVIEW,
    parent_id: null,
    title: "",
    standard_code: "",
    initiator_role: "",
    leader_role: "",
    auditor_role: "",
  });
  const [descriptionHTML, setDescriptionHTML] = useState(EMPTY_DESCRIPTION);
  // 编辑器只在挂载时由 initialValue 灌一次内容，换编辑对象 / 重开弹窗都要换 key 重挂
  const [editorVersion, setEditorVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // 错误挂在哪个输入框上：标红那一格，并把提示放在编号 / 名称那一行下面；null = 其它错误，放在表单底部
  const [errorField, setErrorField] = useState<TErrorField>(null);

  const isEdit = Boolean(template);
  const isActivity = STAGE_REVIEW_ACTIVITY_KINDS.includes(value.kind);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setErrorField(null);
    setEditorVersion((current) => current + 1);
    if (template) {
      setValue({
        kind: template.kind,
        parent_id: template.parent_id,
        title: template.title,
        standard_code: template.standard_code ?? "",
        initiator_role: template.initiator_role,
        leader_role: template.leader_role,
        auditor_role: template.auditor_role,
      });
      setDescriptionHTML(template.description_html?.trim() ? template.description_html : EMPTY_DESCRIPTION);
      return;
    }
    // 从某条评审的 ＋ 进来：类型由父级的族推导，归属预选好
    const kind = defaultParent
      ? STAGE_REVIEW_ACTIVITY_KIND_BY_ROOT[defaultParent.kind]
      : EStageReviewKind.REVIEW;
    setValue({
      kind,
      parent_id: defaultParent?.id ?? null,
      title: "",
      standard_code: "",
      initiator_role: "",
      leader_role: "",
      auditor_role: "",
    });
    setDescriptionHTML(EMPTY_DESCRIPTION);
  }, [isOpen, template, defaultParent]);

  /** 归属候选：只列同族的根评审。族不匹配的挂上去后端会 400 */
  const parentOptions = useMemo(() => {
    if (!isActivity) return [];
    const wantedRootKind = rootKindFor(value.kind);
    return stageRoots.filter(
      (root) => STAGE_REVIEW_ROOT_KINDS.includes(root.kind) && root.kind === wantedRootKind
    );
  }, [isActivity, value.kind, stageRoots]);

  const handleKindChange = (kind: EStageReviewKind) => {
    setValue((current) => {
      // 换族或换成根类型，原来的归属就不成立了，直接清掉
      const keepParent =
        STAGE_REVIEW_ACTIVITY_KINDS.includes(kind) &&
        stageRoots.some((root) => root.id === current.parent_id && STAGE_REVIEW_ACTIVITY_KIND_BY_ROOT[root.kind] === kind);
      return { ...current, kind, parent_id: keepParent ? current.parent_id : null };
    });
  };

  const showError = (message: string, field: TErrorField) => {
    setError(message);
    setErrorField(field);
  };

  const clearError = () => {
    setError(null);
    setErrorField(null);
  };

  const handleSubmit = async () => {
    const standardCode = value.standard_code.trim();
    const title = value.title.trim();
    if (!standardCode) {
      showError(t(`${I18N}.form.code_required`), "standard_code");
      return;
    }
    if (!title) {
      showError(t(`${I18N}.form.title_required`), "title");
      return;
    }
    // 本地先查一遍：后端只回错误码，说不出是被哪个节点占了
    const taken = allTemplates.find((item) => item.standard_code === standardCode && item.id !== template?.id);
    if (taken) {
      showError(t(`${I18N}.form.code_taken`, { code: standardCode, title: taken.title }), "standard_code");
      return;
    }
    // 编辑器清空后留下的是 <p></p> 而不是空串，落库前抹平成空
    const isBlank = isEmptyHtmlString(descriptionHTML, ["img", "image-component", "table"]);
    try {
      await onSubmit({
        ...value,
        standard_code: standardCode,
        title,
        description_html: isBlank ? "" : descriptionHTML,
      });
    } catch (submitError) {
      const payload = submitError as Record<string, unknown> | undefined;
      const codeError = payload?.standard_code;
      const code = Array.isArray(codeError) ? String(codeError[0]) : null;
      if (code?.startsWith(CODE_ERROR_PREFIX)) {
        showError(t(`${I18N}.form.errors.${code.toLowerCase()}`), "standard_code");
        return;
      }
      const first = payload ? Object.entries(payload)[0] : undefined;
      if (first && Array.isArray(first[1])) {
        showError(String(first[1][0]), first[0] === "title" ? "title" : null);
        return;
      }
      showError(t(`${I18N}.form.save_failed`), null);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex items-start justify-between border-b border-subtle px-5 py-4">
        <div>
          <h2 className="text-14 font-medium text-primary">
            {t(isEdit ? `${I18N}.form.edit_title` : `${I18N}.form.create_title`)}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover disabled:opacity-50"
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3.5 px-5 py-4">
        {/* 编号与名称同一行：编号定宽在左，名称吃剩余宽度；两者的错误都提示在这一行下面 */}
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-12 text-tertiary">
                {t(`${I18N}.table.code`)}
                <span className="ml-0.5 text-danger-primary">*</span>
              </span>
              <input
                autoFocus
                value={value.standard_code}
                maxLength={80}
                disabled={isSubmitting}
                aria-invalid={errorField === "standard_code"}
                onChange={(event) => {
                  setValue((current) => ({ ...current, standard_code: event.target.value }));
                  clearError();
                }}
                className={cn(INPUT_CLASS, "font-mono", errorField === "standard_code" && "border-danger-strong")}
                placeholder={t(`${I18N}.form.code_placeholder`)}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-12 text-tertiary">
                {t(`${I18N}.table.title`)}
                <span className="ml-0.5 text-danger-primary">*</span>
              </span>
              <input
                value={value.title}
                maxLength={255}
                disabled={isSubmitting}
                aria-invalid={errorField === "title"}
                onChange={(event) => {
                  setValue((current) => ({ ...current, title: event.target.value }));
                  clearError();
                }}
                className={cn(INPUT_CLASS, errorField === "title" && "border-danger-strong")}
                placeholder={t(`${I18N}.form.title_placeholder`)}
              />
            </label>
          </div>
          {error && errorField && (
            <p className="flex items-start gap-1 text-11 leading-4 text-danger-primary">
              <AlertCircle className="mt-px size-3 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-12 text-tertiary">{t(`${I18N}.table.kind`)}</span>
          <div className="flex gap-1.5">
            {KIND_OPTIONS.map((kind) => (
              <button
                key={kind}
                type="button"
                disabled={isSubmitting || isEdit}
                onClick={() => handleKindChange(kind)}
                // 选项里直接放列表里那枚类型徽章，颜色与各处一致；选中靠描边区分
                className={cn(
                  "flex h-8 flex-1 items-center justify-center rounded-md border transition-colors",
                  value.kind === kind ? "border-accent-strong" : "border-subtle hover:bg-layer-1-hover",
                  (isSubmitting || isEdit) && "cursor-not-allowed opacity-60"
                )}
              >
                <StageReviewKindBadge kind={kind} />
              </button>
            ))}
          </div>
        </div>

        {/* 只有评审活动才谈得上归属；评审恒在顶层 */}
        {isActivity && (
          <label className="flex flex-col gap-1.5">
            <span className="text-12 text-tertiary">{t(`${I18N}.form.parent_label`)}</span>
            <select
              value={value.parent_id ?? ""}
              disabled={isSubmitting}
              onChange={(event) =>
                setValue((current) => ({ ...current, parent_id: event.target.value || null }))
              }
              className={INPUT_CLASS}
            >
              <option value="">{t(`${I18N}.form.parent_stage_option`)}</option>
              {parentOptions.map((root) => (
                <option key={root.id} value={root.id}>
                  {root.title}
                </option>
              ))}
            </select>
            {parentOptions.length === 0 && (
              <p className="text-10 leading-4 text-tertiary">{t(`${I18N}.form.parent_empty`)}</p>
            )}
          </label>
        )}

        {/* 描述会在裁剪表签批生效、生成评审实例时原样带到评审上 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-12 text-tertiary">{t(`${I18N}.form.description_label`)}</span>
          {workspaceId ? (
            <div className="overflow-hidden rounded-md border border-subtle bg-surface-1 focus-within:border-accent-strong">
              <div className="vertical-scrollbar scrollbar-sm max-h-48 min-h-20 overflow-y-auto">
                <RichTextEditor
                  key={`srt-description-${editorVersion}`}
                  id={`stage_review_template_description_${template?.id ?? "new"}`}
                  editable
                  initialValue={descriptionHTML}
                  value={null}
                  onChange={(_json, html) => setDescriptionHTML(html)}
                  workspaceSlug={workspaceSlug}
                  workspaceId={workspaceId}
                  // 模板是工作区级的，没有配套的资产 entity_type，所以不开图片；
                  // 这两个 handler 只是为了满足 editable 分支的类型要求，禁用后不会被调到。
                  disabledExtensions={["image"]}
                  dragDropEnabled={false}
                  uploadFile={async () => ""}
                  duplicateFile={async () => ""}
                  searchMentionCallback={(payload) => workspaceService.searchEntity(workspaceSlug, payload)}
                  placeholder={() => ""}
                  containerClassName="min-h-20 pr-3 pt-2 text-13"
                />
              </div>
            </div>
          ) : (
            <Loader>
              <Loader.Item height="80px" />
            </Loader>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-12 text-tertiary">{t(`${I18N}.table.initiator`)}</span>
          <input
            value={value.initiator_role}
            maxLength={255}
            disabled={isSubmitting}
            onChange={(event) => setValue((current) => ({ ...current, initiator_role: event.target.value }))}
            className={INPUT_CLASS}
            placeholder={t(`${I18N}.form.role_placeholder`)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-12 text-tertiary">{t(`${I18N}.table.leader`)}</span>
            <input
              value={value.leader_role}
              maxLength={255}
              disabled={isSubmitting}
              onChange={(event) => setValue((current) => ({ ...current, leader_role: event.target.value }))}
              className={INPUT_CLASS}
              placeholder={t(`${I18N}.form.role_placeholder`)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-12 text-tertiary">{t(`${I18N}.table.auditor`)}</span>
            <input
              value={value.auditor_role}
              maxLength={255}
              disabled={isSubmitting}
              onChange={(event) => setValue((current) => ({ ...current, auditor_role: event.target.value }))}
              className={INPUT_CLASS}
              placeholder={t(`${I18N}.form.auditor_placeholder`)}
            />
          </label>
        </div>

        {/* 角色填的是名称不是人：模板是工作区级标准流程，落到项目 + 产品时才解析成人 */}
        <p className="text-10 leading-4 text-tertiary">{t(`${I18N}.form.role_hint`)}</p>
        {error && !errorField && <p className="text-10 leading-4 text-danger-primary">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
          {t("cancel")}
        </Button>
        <Button variant="primary" size="sm" onClick={() => void handleSubmit()} loading={isSubmitting}>
          {t(isEdit ? "save" : "create")}
        </Button>
      </div>
    </ModalCore>
  );
});
