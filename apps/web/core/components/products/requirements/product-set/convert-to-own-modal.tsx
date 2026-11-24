import { useEffect, useState } from "react";
import { ArrowRight, Layers } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirement } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();
const I18N = "workspace_product_sets.requirements";

type TProps = {
  workspaceSlug: string;
  productId: string;
  /** 本产品的开发编号，写在三条规则里 */
  productIdentifier: string;
  productSetName: string;
  /** 要转的引用需求（行内点的一条，或批量勾选的多条）；空数组 = 关着 */
  requirements: TRequirement[];
  handleClose: () => void;
  onConvert: (requirementIds: string[]) => Promise<{ converted: number; failed: { id: string; error?: string }[] }>;
};

/**
 * 「转为自有」确认框。单条：编号对照（MP01-3 → MP01-3-1）+ 三条后果；
 * 多条：列出要转的需求 + 同样三条后果，转换后编号各自按来源需求流水生成。
 */
export function ConvertToOwnModal(props: TProps) {
  const { workspaceSlug, productId, productIdentifier, productSetName, requirements, handleClose, onConvert } = props;
  const { t } = useTranslation();
  const isSingle = requirements.length === 1;
  const singleId = isSingle ? requirements[0].id : undefined;
  const [nextDisplayId, setNextDisplayId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 副编号是来源需求下的流水号，要问服务端才知道下一个是几（只有单条时展示）
  useEffect(() => {
    if (!singleId) return;
    let cancelled = false;
    setNextDisplayId(null);
    requirementService
      .previewConvertReferencedRequirement(workspaceSlug, productId, singleId)
      .then((response) => {
        if (!cancelled) setNextDisplayId(response.display_id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [productId, singleId, workspaceSlug]);

  const handleSubmit = async () => {
    if (!requirements.length) return;
    setIsSubmitting(true);
    try {
      const { converted, failed } = await onConvert(requirements.map((item) => item.id));
      if (failed.length === 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("success"),
          message: isSingle ? t(`${I18N}.convert_done`) : `已将 ${converted} 条需求转为自有。`,
        });
      } else {
        const reason = failed[0].error ?? t(`${I18N}.convert_failed`);
        setToast({
          type: converted > 0 ? TOAST_TYPE.WARNING : TOAST_TYPE.ERROR,
          title: converted > 0 ? t("success") : t("error"),
          message: isSingle ? reason : `成功 ${converted} 条，失败 ${failed.length} 条：${reason}`,
        });
      }
      handleClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t(`${I18N}.convert_failed`) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const rules = [
    t(`${I18N}.convert_rule_content`, { product: productIdentifier }),
    t(`${I18N}.convert_rule_scope`, { product: productIdentifier }),
    t(`${I18N}.convert_rule_irreversible`),
  ];
  const single = isSingle ? requirements[0] : null;

  return (
    <ModalCore
      isOpen={requirements.length > 0}
      handleClose={() => !isSubmitting && handleClose()}
      position={EModalPosition.TOP}
      width={EModalWidth.XL}
    >
      <div className="flex h-14 items-center justify-between border-b border-subtle px-6">
        <h2 className="text-16 font-semibold text-primary">
          {isSingle ? t(`${I18N}.convert`) : `批量转为自有（${requirements.length} 条）`}
        </h2>
        <button
          type="button"
          onClick={handleClose}
          className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
          aria-label={t("close")}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-5 px-6 py-5">
        {single ? (
          <>
            <div className="flex flex-col gap-2 rounded-lg border border-subtle bg-layer-1 px-4 py-3">
              <div className="flex items-center gap-2 text-13">
                <span className="text-tertiary tabular-nums">{single.display_id}</span>
                <span className="inline-flex h-[22px] items-center gap-1 rounded-md bg-accent-subtle px-2 text-12 font-medium text-accent-primary">
                  <Layers className="size-3" />
                  {productSetName}
                </span>
              </div>
              <p className="text-14 font-medium break-words text-primary">{single.title}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-12 text-tertiary">{t(`${I18N}.convert_current_id`)}</span>
                <span className="text-16 font-semibold text-primary tabular-nums">{single.display_id}</span>
              </div>
              <ArrowRight className="size-4 shrink-0 text-tertiary" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-12 text-tertiary">{t(`${I18N}.convert_next_id`)}</span>
                <span className="text-16 font-semibold text-primary tabular-nums">{nextDisplayId ?? "…"}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-13 text-secondary">
              以下 {requirements.length} 条来自产品集「{productSetName}」，转换后在原编号后追加副编号（如 MP01-3 →
              MP01-3-1）。
            </p>
            <ul className="vertical-scrollbar scrollbar-sm max-h-[240px] divide-y divide-subtle overflow-y-auto rounded-lg border border-subtle">
              {requirements.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2 text-13">
                  <span className="w-20 shrink-0 text-tertiary tabular-nums">{item.display_id}</span>
                  <span className="min-w-0 flex-1 truncate text-primary" title={item.title}>
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="flex flex-col gap-2 text-13 text-secondary">
          {rules.map((rule) => (
            <li key={rule} className="flex items-start gap-2">
              <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-layer-3" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-subtle px-6 py-4">
        <Button variant="secondary" size="lg" type="button" onClick={handleClose} disabled={isSubmitting}>
          {t("cancel")}
        </Button>
        <Button variant="primary" size="lg" type="button" loading={isSubmitting} onClick={() => void handleSubmit()}>
          {isSingle ? t(`${I18N}.convert`) : `转为自有（${requirements.length}）`}
        </Button>
      </div>
    </ModalCore>
  );
}
