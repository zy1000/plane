import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import type { TRiskDetail, TUpdateRiskPayload } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { cn, getAssetIdFromUrl } from "@plane/utils";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { FileService } from "@/services/file.service";
import { WorkspaceService } from "@/services/workspace.service";
import { Block, EmptyLine, isBlankRichText } from "../../stage-reviews/detail/stage-review-content";
import { RISK_I18N } from "../constants";
import { RiskAssessmentField } from "../form/risk-assessment-field";
import { RiskStrategySegmented } from "../form/risk-strategy-segmented";

const workspaceService = new WorkspaceService();
const fileService = new FileService();
const EMPTY_RICH_TEXT = "<p></p>";

/** 正文里还引用着的图片资产 id（同 use-product-editor-assets 的本地实现） */
const extractAssetIds = (html: string) => {
  if (typeof DOMParser === "undefined") return new Set<string>();
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return new Set(
    Array.from(parsed.querySelectorAll("image-component"))
      .map((node) => node.getAttribute("src"))
      .filter((src): src is string => Boolean(src))
      .map(getAssetIdFromUrl)
  );
};

/**
 * 编辑区的外壳：平时没有框，悬停出一圈淡边，聚焦出蓝边 —— 与标题、右栏就地编辑格同一口径。
 * 编辑器正文的 14px 靠 globals.css 里 `.stage-review-drawer-body .editor-container.large-font` 覆盖
 * （正文滚动区挂的就是这个类名，见 risk-detail-root）。
 */
const FIELD_BOX_CLASS =
  "-mx-2.5 rounded-lg border border-transparent px-2.5 py-1.5 transition hover:border-subtle focus-within:border-accent-strong";
const FIELD_LINE_CLASS =
  "min-h-7 [font-family:var(--font-style)] text-[length:var(--font-size-regular)] leading-[var(--line-height-regular)]";

type TRichField = "description_html" | "impact_description_html" | "response_measures_html";

/** 三段富文本：风险描述必填，另两段可空；空且只读时整块不出 */
const DESCRIPTION_FIELD = {
  key: "description_html",
  labelKey: "description",
  placeholderKey: "form.editor_placeholder",
  required: true,
} as const;
const IMPACT_DESCRIPTION_FIELD = {
  key: "impact_description_html",
  labelKey: "impact_description",
  placeholderKey: "detail.impact_description_placeholder",
  required: false,
} as const;
const RESPONSE_MEASURES_FIELD = {
  key: "response_measures_html",
  labelKey: "response_measures",
  placeholderKey: "detail.response_measures_placeholder",
  required: false,
} as const;
type TRichFieldConfig = { key: TRichField; labelKey: string; placeholderKey: string; required: boolean };

/**
 * 详情正文，顺序同新建弹窗左栏：风险描述 → 评估（影响程度 / 发生概率 / 风险等级）→ 影响描述 → 应对措施
 * → 风险损失 → 触发因素 → 风险管理策略。附件 / 关联缺陷 / 活动由 risk-detail-root 接在后面。
 *
 * 全部就地编辑、改了直接保存：富文本失焦保存（工作项那套 RichTextEditor），单行文本失焦保存，
 * 评估卡片和策略点了就存。评估卡片与弹窗是同一个组件：改影响程度 / 发生概率只发这一项，后端重新推算等级；
 * 改等级只发 risk_level（手动调整）。访客只读。
 */
export const RiskContent = ({
  workspaceSlug,
  workspaceId,
  projectId,
  detail,
  editable,
  onUpdate,
}: {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  detail: TRiskDetail;
  editable: boolean;
  onUpdate: (payload: TUpdateRiskPayload) => void;
}) => {
  const { t } = useTranslation();
  const richProps = { workspaceSlug, workspaceId, projectId, detail, editable, onUpdate };
  return (
    <>
      <RichField field={DESCRIPTION_FIELD} {...richProps} />
      <RiskAssessmentField
        impactLevel={detail.impact_level}
        probability={detail.probability}
        riskLevel={detail.risk_level}
        disabled={!editable}
        onChange={(next) => {
          if (next.impactLevel !== undefined) onUpdate({ impact_level: next.impactLevel });
          else if (next.probability !== undefined) onUpdate({ probability: next.probability });
          else if (next.riskLevel) onUpdate({ risk_level: next.riskLevel });
        }}
      />
      <RichField field={IMPACT_DESCRIPTION_FIELD} {...richProps} />
      <RichField field={RESPONSE_MEASURES_FIELD} {...richProps} />
      <InlineTextField
        title={t(`${RISK_I18N}.fields.risk_loss`)}
        value={detail.risk_loss}
        placeholder={t(`${RISK_I18N}.detail.risk_loss_placeholder`)}
        editable={editable}
        onSave={(next) => onUpdate({ risk_loss: next })}
      />
      <InlineTextField
        title={t(`${RISK_I18N}.fields.trigger_factors`)}
        value={detail.trigger_factors}
        placeholder={t(`${RISK_I18N}.detail.trigger_factors_placeholder`)}
        editable={editable}
        onSave={(next) => onUpdate({ trigger_factors: next })}
      />
      <Block title={t(`${RISK_I18N}.fields.strategy`)}>
        <RiskStrategySegmented
          value={detail.strategy}
          disabled={!editable}
          onChange={(next) => onUpdate({ strategy: next })}
        />
      </Block>
    </>
  );
};

/**
 * 单行文本（风险损失 / 触发因素）：外壳同富文本（平时无框、悬停淡边、聚焦蓝边），失焦保存，没改不发请求。
 * 空且只读时整块不出（同可空的两段富文本）。
 */
const InlineTextField = ({
  title,
  value,
  placeholder,
  editable,
  onSave,
}: {
  title: string;
  value: string;
  placeholder: string;
  editable: boolean;
  onSave: (next: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (!editable) {
    if (!value) return null;
    return (
      <Block title={title}>
        <p className={cn(FIELD_LINE_CLASS, "break-words text-secondary")}>{value}</p>
      </Block>
    );
  }
  return (
    <Block title={title}>
      <input
        value={draft}
        maxLength={255}
        placeholder={placeholder}
        aria-label={title}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next !== value) onSave(next);
          else setDraft(value);
        }}
        className={cn(
          FIELD_BOX_CLASS,
          "w-[calc(100%+1.25rem)] bg-transparent text-14 text-primary outline-none placeholder:text-placeholder"
        )}
      />
    </Block>
  );
};

/**
 * 一段富文本。内联图片走 PROJECT_DESCRIPTION 资产，口径同阶段评审 / 迭代描述：单开一个
 * entity_type 要连带改 FileAsset 外键、file_path 解析和资产目录树三处。
 *
 * 存在**焦点离开整块**时：contenteditable 的 focusout 会冒泡到外层 div，点工具栏按钮
 * 也算 focusout，所以要用 relatedTarget 判断焦点是不是还留在块内。描述是必填项，清空了不发请求。
 */
const RichField = ({
  field,
  workspaceSlug,
  workspaceId,
  projectId,
  detail,
  editable,
  onUpdate,
}: {
  field: TRichFieldConfig;
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  detail: TRiskDetail;
  editable: boolean;
  /** 返回保存后的详情；失败 / 没保存是 undefined */
  onUpdate: (payload: TUpdateRiskPayload) => Promise<TRiskDetail | undefined> | void;
}) => {
  const { t } = useTranslation();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const value = detail[field.key];
  const isBlank = isBlankRichText(value);
  const saved = isBlank ? EMPTY_RICH_TEXT : value;
  const [draft, setDraft] = useState(saved);
  /**
   * 编辑中被移走的图片先记下来，不立刻删对象：描述是必填，只剩一张图时删掉它会被拦住不保存，
   * 立刻删就留下一个指向已删资产的坏引用；自动保存失败同理。保存成功后再删已不在正文里的那些。
   */
  const deferredDeleteIdsRef = useRef<Set<string>>(new Set());

  const handleDeferredAssetDelete = useCallback(async (assetSrc: string) => {
    deferredDeleteIdsRef.current.add(getAssetIdFromUrl(assetSrc));
  }, []);

  const commitDeferredDeletes = useCallback(
    async (savedHtml: string) => {
      const active = extractAssetIds(savedHtml);
      const removed = Array.from(deferredDeleteIdsRef.current).filter((assetId) => !active.has(assetId));
      deferredDeleteIdsRef.current = new Set(Array.from(deferredDeleteIdsRef.current).filter((id) => active.has(id)));
      await Promise.allSettled(removed.map((assetId) => fileService.deleteWorkspaceAsset(workspaceSlug, assetId)));
    },
    [workspaceSlug]
  );

  /**
   * 换一条风险时整个重置；保存回来时只在手上没改过（草稿还等于上一次同步的值）才回灌 ——
   * 失焦发出第一版后又接着改，第一版的响应回来不能把第二版冲掉，否则下次失焦看到
   * `draft === saved` 就不发请求，第二版静默丢失。
   */
  const lastSyncedRef = useRef({ id: detail.id, saved });
  useEffect(() => {
    const previous = lastSyncedRef.current;
    lastSyncedRef.current = { id: detail.id, saved };
    if (previous.id !== detail.id) {
      setDraft(saved);
      return;
    }
    setDraft((current) => (current === previous.saved ? saved : current));
  }, [detail.id, saved]);

  const handleUploadFile = useCallback(
    async (blockId: string | undefined, file: File) => {
      const { asset_id } = await uploadEditorAsset({
        blockId: blockId ?? "",
        data: { entity_identifier: projectId, entity_type: EFileAssetType.PROJECT_DESCRIPTION },
        file,
        projectId,
        workspaceSlug,
      });
      return asset_id;
    },
    [projectId, uploadEditorAsset, workspaceSlug]
  );

  const handleDuplicateFile = useCallback(
    async (assetId: string) => {
      const { asset_id } = await duplicateEditorAsset({
        assetId,
        entityId: projectId,
        entityType: EFileAssetType.PROJECT_DESCRIPTION,
        projectId,
        workspaceSlug,
      });
      return asset_id;
    },
    [duplicateEditorAsset, projectId, workspaceSlug]
  );

  const title = t(`${RISK_I18N}.detail.${field.labelKey}`);
  const editorId = `risk_${field.key}_${detail.id}`;

  if (!editable) {
    // 可空的两段空着就不占地；描述是必填，空着（老数据）时留一行占位
    if (isBlank) {
      if (!field.required) return null;
      return (
        <Block title={title}>
          <EmptyLine text={t(`${RISK_I18N}.detail.unset`)} />
        </Block>
      );
    }
    return (
      <Block title={title}>
        <RichTextEditor
          id={editorId}
          editable={false}
          initialValue={saved}
          value={saved}
          onChange={() => {}}
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          projectId={projectId}
          containerClassName={`!p-0 ${FIELD_LINE_CLASS} text-secondary`}
        />
      </Block>
    );
  }

  return (
    <Block title={title}>
      <div
        className={FIELD_BOX_CLASS}
        onBlur={(event) => {
          // 焦点还在块内（比如点了工具栏按钮）就不算改完
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          if (draft === saved) return;
          if (field.required && isBlankRichText(draft)) return;
          const payload: TUpdateRiskPayload = {};
          payload[field.key] = draft;
          void (async () => {
            const next = await onUpdate(payload);
            if (next) await commitDeferredDeletes(next[field.key] ?? "");
          })();
        }}
      >
        <RichTextEditor
          // 换风险要重挂：editable 时 value 传 null，内容只在挂载时由 initialValue 灌一次
          key={detail.id}
          id={editorId}
          editable
          initialValue={saved}
          value={null}
          onChange={(_json, html) => setDraft(html)}
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          projectId={projectId}
          placeholder={t(`${RISK_I18N}.${field.placeholderKey}`)}
          searchMentionCallback={async (payload) =>
            await workspaceService.searchEntity(workspaceSlug, { ...payload, project_id: projectId })
          }
          uploadFile={handleUploadFile}
          duplicateFile={handleDuplicateFile}
          deferAssetDeletion
          onDeferredAssetDelete={handleDeferredAssetDelete}
          containerClassName={`!p-0 ${FIELD_LINE_CLASS}`}
        />
      </div>
    </Block>
  );
};
