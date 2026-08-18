/**
 * 需求详情关联区的快捷操作条，视觉对齐工作项的 IssueDetailWidgetActionButtons：
 * 同一条分段边框里放「拆分 / 关联工作项 / 关联用例」。
 */
import { FlaskConical, Link2, Split } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { IssueDetailWidgetButton } from "@/components/issues/issue-detail-widgets/widget-button";

const WIDGET_GROUP_LAYOUT =
  "inline-flex max-w-full flex-nowrap items-stretch divide-x divide-subtle overflow-hidden rounded-md border border-subtle bg-layer-1 shadow-raised-100";
const WIDGET_GROUP_SEGMENT = "flex min-w-0 shrink-0 items-stretch";
const WIDGET_GROUP_TRIGGER_CLASS =
  "!h-7 min-w-7 !justify-center !rounded-none !border-0 !px-2.5 !shadow-none hover:bg-layer-2-hover";

const GroupTooltip = ({ content, children }: { content: string; children: React.ReactElement }) => (
  <Tooltip tooltipContent={content} position="top" openDelay={200}>
    <div className="inline-flex h-full w-full min-w-0 max-w-full items-stretch">{children}</div>
  </Tooltip>
);

type TProps = {
  onSplit: () => void;
  onLinkIssue: () => void;
  onLinkTestCase?: () => void;
};

export const RequirementRelationActionButtons = (props: TProps) => {
  const { onSplit, onLinkIssue, onLinkTestCase } = props;
  const { t } = useTranslation();
  const splitLabel = t("project_requirements.issues.split");
  const linkIssueLabel = t("project_requirements.issues.link_existing");
  const linkCaseLabel = t("requirement_detail.test_cases.link_existing");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={WIDGET_GROUP_LAYOUT} role="group" aria-label={t("project_requirements.relations_toolbar")}>
        <div className={WIDGET_GROUP_SEGMENT}>
          <GroupTooltip content={splitLabel}>
            <IssueDetailWidgetButton
              title={splitLabel}
              variant="ghost"
              className={WIDGET_GROUP_TRIGGER_CLASS}
              icon={<Split className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
              onClick={onSplit}
            />
          </GroupTooltip>
        </div>
        <div className={WIDGET_GROUP_SEGMENT}>
          <GroupTooltip content={linkIssueLabel}>
            <IssueDetailWidgetButton
              title={linkIssueLabel}
              showLabel={false}
              variant="ghost"
              className={`${WIDGET_GROUP_TRIGGER_CLASS} !px-2`}
              icon={<Link2 className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
              onClick={onLinkIssue}
            />
          </GroupTooltip>
        </div>
        {onLinkTestCase && (
          <div className={WIDGET_GROUP_SEGMENT}>
            <GroupTooltip content={linkCaseLabel}>
              <IssueDetailWidgetButton
                title={linkCaseLabel}
                showLabel={false}
                variant="ghost"
                className={`${WIDGET_GROUP_TRIGGER_CLASS} !px-2`}
                icon={<FlaskConical className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
                onClick={onLinkTestCase}
              />
            </GroupTooltip>
          </div>
        )}
      </div>
    </div>
  );
};
