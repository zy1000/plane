/**
 * 打基线。
 *
 * 弹窗一打开就先跑一次 dry-run —— 基线只收录**通过过审批**的需求，用户必须在按下确认
 * 之前就知道「会纳入多少条、哪些没纳入、哪些纳入的不是当前内容」，否则打出来的是一份
 * 他以为存在、实际不存在的快照。预览与落库共用服务端同一份判定，数字不会在确认后变。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type {
  TRequirementBaselinePayload,
  TRequirementBaselinePreview,
  TRequirementBaselineScope,
  TRequirementTypeSchema,
} from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

const SCOPES: TRequirementBaselineScope[] = ["all", "by_type"];

type TProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  requirementTypes: TRequirementTypeSchema[];
  onPreview: (payload: TRequirementBaselinePayload) => Promise<TRequirementBaselinePreview>;
  onClose: () => void;
  onSubmit: (payload: TRequirementBaselinePayload) => void;
};

export function CreateBaselineModal(props: TProps) {
  const { isOpen, isSubmitting, requirementTypes, onPreview, onClose, onSubmit } = props;
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<TRequirementBaselineScope>("all");
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<TRequirementBaselinePreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setDescription("");
    setScope("all");
    setTypeIds([]);
    setPreview(null);
  }, [isOpen]);

  const scopePayload = useMemo<TRequirementBaselinePayload>(
    () => (scope === "by_type" ? { scope, requirement_type_ids: typeIds } : { scope: "all" }),
    [scope, typeIds]
  );
  /** 按类型收录时一个都没选 —— 服务端会 400，本地先停住免得白跑一次 */
  const isScopeIncomplete = scope === "by_type" && typeIds.length === 0;

  const runPreview = useCallback(async () => {
    if (isScopeIncomplete) {
      setPreview(null);
      return;
    }
    setIsPreviewLoading(true);
    try {
      setPreview(await onPreview(scopePayload));
    } catch {
      setPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [isScopeIncomplete, onPreview, scopePayload]);

  useEffect(() => {
    if (!isOpen) return;
    void runPreview();
  }, [isOpen, runPreview]);

  const toggleType = (typeId: string) =>
    setTypeIds((current) =>
      current.includes(typeId) ? current.filter((item) => item !== typeId) : [...current, typeId]
    );

  const canSubmit = Boolean(name.trim()) && !isScopeIncomplete && (preview?.entry_count ?? 0) > 0;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="p-5">
        <h2 className="text-16 font-semibold text-primary">
          {t("workspace_products.requirements.baseline.form.title")}
        </h2>
        <p className="mt-1 text-12 leading-5 text-secondary">
          {t("workspace_products.requirements.baseline.form.description")}
        </p>

        <label className="mt-4 block">
          <span className="mb-2 block text-12 font-medium text-primary">
            {t("workspace_products.requirements.baseline.form.name")}
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={255}
            autoFocus
            className="focus:border-accent-primary w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 text-12 text-primary outline-none placeholder:text-placeholder"
            placeholder={t("workspace_products.requirements.baseline.form.name_placeholder")}
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-2 block text-12 font-medium text-primary">
            {t("workspace_products.requirements.baseline.form.summary")}
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            maxLength={2000}
            className="focus:border-accent-primary w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2 text-12 leading-5 text-primary outline-none placeholder:text-placeholder"
            placeholder={t("workspace_products.requirements.baseline.form.summary_placeholder")}
          />
        </label>

        {requirementTypes.length > 1 && (
          <div className="mt-3">
            <span className="mb-2 block text-12 font-medium text-primary">
              {t("workspace_products.requirements.baseline.form.scope.label")}
            </span>
            <div className="flex items-center gap-1.5">
              {SCOPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-11 transition-colors",
                    scope === value
                      ? "border-accent-primary bg-accent-subtle text-accent-primary"
                      : "border-subtle text-secondary hover:text-primary"
                  )}
                >
                  {t(`workspace_products.requirements.baseline.form.scope.${value}`)}
                </button>
              ))}
            </div>
            {scope === "by_type" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {requirementTypes.map((requirementType) => (
                  <button
                    key={requirementType.id}
                    type="button"
                    onClick={() => toggleType(requirementType.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-11 transition-colors",
                      typeIds.includes(requirementType.id)
                        ? "border-accent-primary bg-accent-subtle text-accent-primary"
                        : "border-subtle text-secondary hover:text-primary"
                    )}
                  >
                    {requirementType.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 rounded-md border border-subtle bg-layer-1 p-3">
          {isPreviewLoading ? (
            <Loader>
              <Loader.Item height="16px" width="180px" />
            </Loader>
          ) : !preview ? (
            <p className="text-12 text-tertiary">
              {t("workspace_products.requirements.baseline.form.preview.unavailable")}
            </p>
          ) : (
            <>
              <p className="text-13 font-medium text-primary">
                {t("workspace_products.requirements.baseline.form.preview.included", {
                  count: preview.entry_count,
                })}
              </p>
              {preview.skipped.length > 0 && (
                <PreviewNote
                  tone="info"
                  title={t("workspace_products.requirements.baseline.form.preview.skipped", {
                    count: preview.skipped.length,
                  })}
                  titles={preview.skipped.map((item) => item.title)}
                />
              )}
              {preview.stale.length > 0 && (
                <PreviewNote
                  tone="warning"
                  title={t("workspace_products.requirements.baseline.form.preview.stale", {
                    count: preview.stale.length,
                  })}
                  titles={preview.stale.map((item) =>
                    t(`workspace_products.requirements.baseline.stale_reason.${item.reason}`, {
                      title: item.title,
                      version: item.version,
                    })
                  )}
                />
              )}
            </>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            loading={isSubmitting}
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({ ...scopePayload, name: name.trim(), description: description.trim() })
            }
          >
            {t("workspace_products.requirements.baseline.form.confirm")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}

/** 预览里的一条提示。标题最多列 5 条，多了只给计数 —— 弹窗不是清单页 */
function PreviewNote({ tone, title, titles }: { tone: "info" | "warning"; title: string; titles: string[] }) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <div className="mt-2 flex gap-2">
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone === "warning" ? "text-warning-primary" : "text-tertiary")} />
      <div className="min-w-0">
        <p className={cn("text-12", tone === "warning" ? "text-warning-primary" : "text-secondary")}>{title}</p>
        <p className="mt-0.5 truncate text-11 text-tertiary">{titles.slice(0, 5).join("、")}</p>
      </div>
    </div>
  );
}
