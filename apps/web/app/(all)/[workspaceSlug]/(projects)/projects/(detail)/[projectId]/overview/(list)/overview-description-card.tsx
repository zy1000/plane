import { type FC, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { BookOpen, History, Maximize2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { IProject, TNameDescriptionLoader } from "@plane/types";
import { calculateTimeAgo } from "@plane/utils";
import { ProjectDescriptionInput } from "@/components/project/project-description-input";
import { useMember } from "@/hooks/store/use-member";
import { OverviewCard, overviewIconButtonClass } from "./overview-card";

type Props = {
  project: IProject;
  workspaceSlug: string;
  onExpand: () => void;
};

/** 编辑器的空内容是 <p></p> 之类的空标签；有图片 / 表格也算有内容 */
const isDescriptionEmpty = (html: string | null | undefined) => {
  if (!html) return true;
  if (/<(img|table|iframe|video)\b/i.test(html)) return false;
  return html.replace(/<[^>]*>/g, "").trim().length === 0;
};

/** 概览「项目描述」卡：只读预览、高度随内容并封顶，超出走全屏弹窗 */
export const OverviewDescriptionCard: FC<Props> = observer(({ project, workspaceSlug, onExpand }) => {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  // ProjectDescriptionInput 只读时也要求这个 setter；这里没有保存动作，状态不消费
  const [, setIsSubmitting] = useState<TNameDescriptionLoader>("submitted");
  const isEmpty = isDescriptionEmpty(project.description_html);

  const editMeta = useMemo(() => {
    if (!project.updated_at) return null;
    const userId = project.updated_by ?? project.created_by;
    const details = userId ? getUserDetails(userId) : null;
    const displayName = userId ? details?.display_name || details?.email || userId : null;
    return (
      <span className="flex items-center gap-1 text-11 text-tertiary">
        <History className="size-3.5" />
        {t("description_versions.last_edited_by")}{" "}
        <span className="font-medium">{displayName ?? t("common.deactivated_user")}</span>{" "}
        {calculateTimeAgo(project.updated_at)}
      </span>
    );
  }, [project.updated_at, project.updated_by, project.created_by, getUserDetails, t]);

  return (
    <OverviewCard
      title={t("project_overview.description.title")}
      icon={BookOpen}
      meta={editMeta}
      action={
        <button
          type="button"
          className={overviewIconButtonClass}
          aria-label={t("project_overview.description.fullscreen")}
          title={t("project_overview.description.fullscreen")}
          onClick={onExpand}
        >
          <Maximize2 className="size-3.5" />
        </button>
      }
      className="h-full"
    >
      {isEmpty ? (
        <p className="py-6 text-center text-12 text-placeholder">{t("project_overview.description.empty")}</p>
      ) : (
        <div className="relative px-4 pb-4">
          {/* contain:paint 让本卡片成为只读编辑器内 position:fixed 拖拽手柄的包含块并裁剪它，
              否则该 fixed 元素会逃逸 overflow-hidden、停靠在描述完整高度处，撑出页面底部空白 */}
          <div className="max-h-[220px] overflow-hidden [contain:paint]">
            <ProjectDescriptionInput
              workspaceSlug={workspaceSlug}
              projectId={project.id}
              initialValue={project.description_html}
              disabled
              setIsSubmitting={setIsSubmitting}
              swrProjectDescription={project.description_html}
              containerClassName="pb-0"
            />
          </div>
          <div className="pointer-events-none absolute inset-x-4 bottom-11 h-10 bg-gradient-to-t from-surface-1 to-transparent" />
          <button
            type="button"
            className="mt-2 text-12 font-medium text-accent-primary hover:underline"
            onClick={onExpand}
          >
            {t("project_overview.description.expand")}
          </button>
        </div>
      )}
    </OverviewCard>
  );
});
