import { ClipboardCheck, Link2, Scissors } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";

const I18N = "stage_review.product_empty";

const PRIMARY =
  "inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-primary px-3 text-13 font-medium text-on-color transition hover:bg-accent-primary-hover";
const SECONDARY =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-strong bg-surface-1 px-3 text-13 font-medium text-secondary transition hover:bg-layer-2";

/**
 * 产品页「阶段评审」一条都没有时的空态。产品页不能新建评审，所以直接把人送到评审的来源：
 *
 * - 没有（可见的）关联项目：先去「项目」tab 关联。
 * - 关联了但还没评审：再给「去评审裁剪」—— 只有一个项目时直达它的裁剪页，多个时落到「项目」tab
 *   让人挑。
 */
export const ProductStageReviewsEmptyState = ({
  workspaceSlug,
  productId,
  linkedProjectIds,
}: {
  workspaceSlug: string;
  productId: string;
  linkedProjectIds: string[];
}) => {
  const { t } = useTranslation();
  const hasProjects = linkedProjectIds.length > 0;
  const projectsHref = `/${workspaceSlug}/products/${productId}/projects`;
  const tailoringHref =
    linkedProjectIds.length === 1 ? `/${workspaceSlug}/projects/${linkedProjectIds[0]}/review-tailorings` : projectsHref;
  const variant = hasProjects ? "no_reviews" : "no_projects";

  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="flex max-w-md flex-col items-center gap-3">
        <span className="grid size-14 place-items-center rounded-2xl bg-layer-2 text-tertiary">
          <ClipboardCheck className="size-6" />
        </span>
        <p className="text-16 font-semibold text-primary">{t(`${I18N}.${variant}_title`)}</p>
        <p className="text-13 leading-relaxed text-tertiary">{t(`${I18N}.${variant}_description`)}</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Link to={projectsHref} className={PRIMARY}>
            <Link2 className="size-3.5" />
            {t(`${I18N}.link_projects`)}
          </Link>
          {hasProjects && (
            <Link to={tailoringHref} className={SECONDARY}>
              <Scissors className="size-3.5" />
              {t(`${I18N}.go_tailoring`)}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};
