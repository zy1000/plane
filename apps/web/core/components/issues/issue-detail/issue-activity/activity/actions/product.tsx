import { observer } from "mobx-react";
import { Boxes, Package } from "lucide-react";
import { useTranslation } from "@plane/i18n";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { ActivityChangeFooter, IssueActivityBlockComponent, IssueLink } from "./";

type TIssueProductActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

const productIcon = <Package className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />;
const moduleIcon = <Boxes className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />;

/** 后端 field = "product" / "product_module"，old/new_value 是名称（模块是「A / B」路径）。 */
const ProductLikeActivity = observer(function ProductLikeActivity(
  props: TIssueProductActivity & { icon: React.ReactNode; fieldLabel: string }
) {
  const { activityId, showIssue = true, ends, icon, fieldLabel } = props;
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);
  if (!activity) return <></>;

  const oldLabel = activity.old_value || "None";
  const newLabel = activity.new_value || "None";
  const showFooter = !!(activity.old_value || activity.new_value);

  return (
    <IssueActivityBlockComponent
      icon={icon}
      activityId={activityId}
      ends={ends}
      footer={
        showFooter ? (
          <ActivityChangeFooter
            from={{ icon, label: oldLabel, labelEmphasis: "muted" }}
            to={{ icon, label: newLabel }}
          />
        ) : null
      }
    >
      <>
        {activity.new_value ? `set the ${fieldLabel} to ` : `removed the ${fieldLabel} `}
        <span className="font-medium text-primary">{activity.new_value || activity.old_value}</span>
        {showIssue && (activity.new_value ? ` for ` : ` from `)}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});

export const IssueProductActivity = observer(function IssueProductActivity(props: TIssueProductActivity) {
  const { t } = useTranslation();
  return <ProductLikeActivity {...props} icon={productIcon} fieldLabel={t("product_field.label")} />;
});

export const IssueProductModuleActivity = observer(function IssueProductModuleActivity(props: TIssueProductActivity) {
  const { t } = useTranslation();
  return <ProductLikeActivity {...props} icon={moduleIcon} fieldLabel={t("product_module_field.label")} />;
});
