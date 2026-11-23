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
  /** 要转的那条引用；null = 关着 */
  requirement: TRequirement | null;
  handleClose: () => void;
  onConvert: (requirementId: string) => Promise<unknown>;
};

/** 「转为自有」确认框：编号对照（MP01-3 → MP01-3-1）+ 三条后果。 */
export function ConvertToOwnModal(props: TProps) {
  const { workspaceSlug, productId, productIdentifier, productSetName, requirement, handleClose, onConvert } = props;
  const { t } = useTranslation();
  const requirementId = requirement?.id;
  const [nextDisplayId, setNextDisplayId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 副编号是来源需求下的流水号，要问服务端才知道下一个是几
  useEffect(() => {
    if (!requirementId) return;
    let cancelled = false;
    setNextDisplayId(null);
    requirementService
      .previewConvertReferencedRequirement(workspaceSlug, productId, requirementId)
      .then((response) => {
        if (!cancelled) setNextDisplayId(response.display_id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [productId, requirementId, workspaceSlug]);

  const handleSubmit = async () => {
    if (!requirementId) return;
    setIsSubmitting(true);
    try {
      await onConvert(requirementId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t(`${I18N}.convert_done`) });
      handleClose();
    } catch (requestError) {
      const error = requestError as { error?: string } | null;
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: error?.error ?? t(`${I18N}.convert_failed`) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const rules = [
    t(`${I18N}.convert_rule_content`, { product: productIdentifier }),
    t(`${I18N}.convert_rule_scope`, { product: productIdentifier }),
    t(`${I18N}.convert_rule_irreversible`),
  ];

  return (
    <ModalCore
      isOpen={Boolean(requirement)}
      handleClose={() => !isSubmitting && handleClose()}
      position={EModalPosition.TOP}
      width={EModalWidth.XL}
    >
      <div className="flex h-14 items-center justify-between border-b border-subtle px-6">
        <h2 className="text-16 font-semibold text-primary">{t(`${I18N}.convert`)}</h2>
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
        {requirement && (
          <div className="flex flex-col gap-2 rounded-lg border border-subtle bg-layer-1 px-4 py-3">
            <div className="flex items-center gap-2 text-13">
              <span className="text-tertiary tabular-nums">{requirement.display_id}</span>
              <span className="inline-flex h-[22px] items-center gap-1 rounded-md bg-accent-subtle px-2 text-12 font-medium text-accent-primary">
                <Layers className="size-3" />
                {productSetName}
              </span>
            </div>
            <p className="text-14 font-medium break-words text-primary">{requirement.title}</p>
          </div>
        )}
        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-12 text-tertiary">{t(`${I18N}.convert_current_id`)}</span>
            <span className="text-16 font-semibold text-primary tabular-nums">{requirement?.display_id}</span>
          </div>
          <ArrowRight className="size-4 shrink-0 text-tertiary" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-12 text-tertiary">{t(`${I18N}.convert_next_id`)}</span>
            <span className="text-16 font-semibold text-primary tabular-nums">{nextDisplayId ?? "…"}</span>
          </div>
        </div>
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
          {t(`${I18N}.convert`)}
        </Button>
      </div>
    </ModalCore>
  );
}
