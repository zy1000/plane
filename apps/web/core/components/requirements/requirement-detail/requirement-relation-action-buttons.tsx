/**
 * 需求详情关联区的快捷操作条，视觉对齐工作项的 IssueDetailWidgetActionButtons：
 * 同一条分段边框里放「拆分 / 关联工作项 / 关联用例 / 上传附件」。每一段都按传没传回调
 * 决定出不出现；一段都没有就整条不渲染。
 */
import type { ReactNode } from "react";
import { FlaskConical, Link2, Paperclip, Split } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { CustomMenu } from "@plane/ui";
import { IssueDetailWidgetButton } from "@/components/issues/issue-detail-widgets/widget-button";
import type { TRequirementAttachmentUploads } from "./use-requirement-attachment-uploads";

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
  /** 拆分 / 关联工作项：不传就没有这两段（没有关联权限，或库条目这类没有工作项的地方） */
  onSplit?: (projectId?: string) => void;
  onLinkIssue?: (projectId?: string) => void;
  onLinkTestCase?: () => void;
  /**
   * 产品侧拆分/关联工作项要落到具体项目。多于一个时按钮展开项目菜单；
   * 不传（项目侧）则直接回调。
   */
  issueProjects?: TIssueProjectOption[];
  /** 上传附件：传了才有这一段（内容可编辑时）。选完文件直接交给它的 onDrop */
  attachmentUploads?: TRequirementAttachmentUploads;
};

/**
 * 操作条上的「上传附件」：自己开一个只点选、不接拖放的 dropzone（拖放区在附件列表上），
 * 上传状态与附件区共用同一份。照工作项的 IssueAttachmentActionButton 做的。
 */
const AttachmentUploadAction = ({
  uploads,
  showLabel,
}: {
  uploads: TRequirementAttachmentUploads;
  /** 它是操作条上唯一一段时带文字（库条目就是这种情况），否则与其它段一样只出图标 */
  showLabel: boolean;
}) => {
  const { t } = useTranslation();
  const label = t("requirement_detail.attachments.upload");
  const { getRootProps, getInputProps } = useDropzone({
    onDrop: uploads.onDrop,
    maxSize: uploads.maxFileSize,
    multiple: true,
    noDrag: true,
  });

  return (
    <GroupTooltip content={label}>
      <button
        type="button"
        {...getRootProps({ className: showLabel ? WIDGET_GROUP_TRIGGER_CLASS : `${WIDGET_GROUP_TRIGGER_CLASS} !px-2` })}
      >
        <input {...getInputProps()} />
        <IssueDetailWidgetButton
          asContentOnly
          showLabel={showLabel}
          title={label}
          icon={<Paperclip className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
        />
      </button>
    </GroupTooltip>
  );
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
  const { onSplit, onLinkIssue, onLinkTestCase, issueProjects, attachmentUploads } = props;
  const { t } = useTranslation();
  const splitLabel = t("project_requirements.issues.split");
  const linkIssueLabel = t("project_requirements.issues.link_existing");
  const linkCaseLabel = t("requirement_detail.test_cases.link_existing");
  const hasIssueActions = Boolean(onSplit || onLinkIssue || onLinkTestCase);
  if (!hasIssueActions && !attachmentUploads) return null;

  return (
    <div className={WIDGET_GROUP_LAYOUT} role="group" aria-label={t("project_requirements.relations_toolbar")}>
      {onSplit && (
        <div className={WIDGET_GROUP_SEGMENT}>
          <IssueProjectAction
            projects={issueProjects}
            tooltip={splitLabel}
            title={splitLabel}
            icon={<Split className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
            onPick={onSplit}
          />
        </div>
      )}
      {onLinkIssue && (
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
      )}
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
      {attachmentUploads && (
        <div className={WIDGET_GROUP_SEGMENT}>
          <AttachmentUploadAction uploads={attachmentUploads} showLabel={!hasIssueActions} />
        </div>
      )}
    </div>
  );
};
