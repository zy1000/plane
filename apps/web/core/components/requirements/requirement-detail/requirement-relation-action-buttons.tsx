/**
 * 需求详情关联区的快捷操作条，视觉对齐工作项的 IssueDetailWidgetActionButtons：
 * 同一条分段边框里放「拆分 / 关联工作项 / 关联用例」。
 */
import type { ReactNode } from "react";
import { ChevronDown, FlaskConical, Link2, Split } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { IssueDetailWidgetButton } from "@/components/issues/issue-detail-widgets/widget-button";
import { SECTION_ACTION_BUTTON } from "./requirement-detail-section";

const WIDGET_GROUP_LAYOUT =
  "inline-flex w-fit max-w-full flex-nowrap items-stretch self-start divide-x divide-subtle overflow-hidden rounded-md border border-subtle bg-layer-1 shadow-raised-100";
const WIDGET_GROUP_SEGMENT = "flex min-w-0 shrink-0 items-stretch";
const WIDGET_GROUP_MENU_CLASS = "relative !w-auto min-w-0 text-left !max-w-none";
const WIDGET_GROUP_TRIGGER_CLASS =
  "inline-flex h-7 w-auto min-w-0 items-center justify-center gap-1 rounded-none !border-0 !bg-transparent px-2.5 text-secondary !shadow-none hover:bg-layer-2-hover";

const GroupTooltip = ({ content, children }: { content: string; children: React.ReactElement }) => (
  <Tooltip tooltipContent={content} position="top" openDelay={200}>
    <div className="inline-flex h-full items-stretch">{children}</div>
  </Tooltip>
);

type TIssueProjectOption = { id: string; name: string };

type TProps = {
  onSplit: (projectId?: string) => void;
  onLinkIssue: (projectId?: string) => void;
  onLinkTestCase?: () => void;
  /**
   * 产品侧拆分/关联工作项要落到具体项目。多于一个时按钮展开项目菜单；
   * 不传（项目侧）则直接回调。
   */
  issueProjects?: TIssueProjectOption[];
};

const IssueProjectAction = ({
  projects,
  tooltip,
  title,
  showLabel,
  icon,
  onPick,
}: {
  projects?: TIssueProjectOption[];
  tooltip: string;
  title: string;
  showLabel?: boolean;
  icon: ReactNode;
  onPick: (projectId?: string) => void;
}) => {
  const { t } = useTranslation();
  const isMenu = Boolean(projects && projects.length > 1);
  const triggerClass = showLabel === false ? `${WIDGET_GROUP_TRIGGER_CLASS} !px-2` : WIDGET_GROUP_TRIGGER_CLASS;
  const button = (
    <IssueDetailWidgetButton
      title={title}
      showLabel={showLabel}
      showMenuChevron={isMenu}
      variant="ghost"
      className={isMenu ? undefined : triggerClass}
      icon={icon}
      asContentOnly={isMenu}
      onClick={isMenu ? undefined : () => onPick(projects?.length === 1 ? projects[0].id : undefined)}
    />
  );

  if (isMenu) {
    return (
      <GroupTooltip content={tooltip}>
        <CustomMenu
          className={WIDGET_GROUP_MENU_CLASS}
          customButton={button}
          customButtonClassName={triggerClass}
          placement="bottom-start"
          closeOnSelect
          maxHeight="md"
        >
          <div className="px-2 py-1 text-caption-sm-regular text-tertiary">
            {t("project_requirements.issues.pick_project")}
          </div>
          {projects?.map((project) => (
            <CustomMenu.MenuItem key={project.id} onClick={() => onPick(project.id)}>
              {project.name}
            </CustomMenu.MenuItem>
          ))}
        </CustomMenu>
      </GroupTooltip>
    );
  }

  return <GroupTooltip content={tooltip}>{button}</GroupTooltip>;
};

export const RequirementRelationActionButtons = (props: TProps) => {
  const { onSplit, onLinkIssue, onLinkTestCase, issueProjects } = props;
  const { t } = useTranslation();
  const splitLabel = t("project_requirements.issues.split");
  const linkIssueLabel = t("project_requirements.issues.link_existing");
  const linkCaseLabel = t("requirement_detail.test_cases.link_existing");

  return (
    <div className={WIDGET_GROUP_LAYOUT} role="group" aria-label={t("project_requirements.relations_toolbar")}>
      <div className={WIDGET_GROUP_SEGMENT}>
        <IssueProjectAction
          projects={issueProjects}
          tooltip={splitLabel}
          title={splitLabel}
          icon={<Split className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
          onPick={onSplit}
        />
      </div>
      <div className={WIDGET_GROUP_SEGMENT}>
        <IssueProjectAction
          projects={issueProjects}
          tooltip={linkIssueLabel}
          title={linkIssueLabel}
          showLabel={false}
          icon={<Link2 className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
          onPick={onLinkIssue}
        />
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
  );
};

/**
 * 抽屉里区块标题行上的动作（带文字的轻按钮）。与上面的分段工具条是同一组动作、同一套
 * 项目落点规则，只是换了个位置：拆分 / 关联挂在「工作项」标题右侧，关联用例挂在「测试用例」
 * 标题右侧 —— 动作紧贴它作用的列表，不再是一排孤零零的图标。
 */
const HeaderProjectAction = ({
  projects,
  label,
  icon,
  onPick,
}: {
  projects?: TIssueProjectOption[];
  label: string;
  icon: ReactNode;
  onPick: (projectId?: string) => void;
}) => {
  const { t } = useTranslation();
  const isMenu = Boolean(projects && projects.length > 1);
  if (!isMenu) {
    return (
      <button
        type="button"
        className={SECTION_ACTION_BUTTON}
        onClick={() => onPick(projects?.length === 1 ? projects[0].id : undefined)}
      >
        {icon}
        {label}
      </button>
    );
  }
  return (
    <CustomMenu
      className="relative !w-auto min-w-0 text-left !max-w-none"
      customButton={
        <span className={cn(SECTION_ACTION_BUTTON, "pr-1.5")}>
          {icon}
          {label}
          <ChevronDown className="size-3 text-placeholder" />
        </span>
      }
      placement="bottom-end"
      closeOnSelect
      maxHeight="md"
    >
      <div className="px-2 py-1 text-caption-sm-regular text-tertiary">{t("project_requirements.issues.pick_project")}</div>
      {projects?.map((project) => (
        <CustomMenu.MenuItem key={project.id} onClick={() => onPick(project.id)}>
          {project.name}
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
};

export const RequirementIssueHeaderActions = ({
  issueProjects,
  onSplit,
  onLinkIssue,
}: Pick<TProps, "issueProjects" | "onSplit" | "onLinkIssue">) => {
  const { t } = useTranslation();
  return (
    <>
      <HeaderProjectAction
        projects={issueProjects}
        label={t("project_requirements.issues.split")}
        icon={<Split className="size-3.5 shrink-0" />}
        onPick={onSplit}
      />
      <HeaderProjectAction
        projects={issueProjects}
        label={t("project_requirements.issues.link_existing")}
        icon={<Link2 className="size-3.5 shrink-0" />}
        onPick={onLinkIssue}
      />
    </>
  );
};

export const RequirementTestCaseHeaderAction = ({ onLink }: { onLink: () => void }) => {
  const { t } = useTranslation();
  return (
    <button type="button" className={SECTION_ACTION_BUTTON} onClick={onLink}>
      <FlaskConical className="size-3.5 shrink-0" />
      {t("requirement_detail.test_cases.link_existing")}
    </button>
  );
};
