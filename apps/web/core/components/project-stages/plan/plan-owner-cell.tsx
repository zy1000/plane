import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useMember } from "@/hooks/store/use-member";

const I18N = "project_stage.plan";

/** 负责人列改了谁：阶段可清空、迭代必须有人、工作项是一组 */
export type TPlanOwnerChange =
  | { kind: "stage"; stageId: string; ownerId: string | null }
  | { kind: "cycle"; cycleId: string; ownerId: string }
  | { kind: "issue"; issueId: string; assigneeIds: string[] };

type TSize = "md" | 20;

/** 头像（最多两个叠着，多的写 +N）；没人且能改时画一个虚线圈当占位 */
const Avatars = observer(function Avatars({
  userIds,
  size,
  editable,
}: {
  userIds: string[];
  size: TSize;
  editable: boolean;
}) {
  const { getUserDetails } = useMember();
  const users = userIds.map((id) => getUserDetails(id)).filter((user) => Boolean(user));
  if (users.length === 0) {
    return editable ? (
      <span className={cn("rounded-full border border-dashed border-strong", size === "md" ? "size-6" : "size-5")} />
    ) : null;
  }
  return (
    <span className="flex items-center -space-x-1">
      {users.slice(0, 2).map((user) => (
        <Avatar key={user!.id} size={size} name={user!.display_name} src={getFileURL(user!.avatar_url ?? "")} />
      ))}
      {users.length > 2 && <span className="pl-1.5 text-11 text-tertiary tabular-nums">+{users.length - 2}</span>}
    </span>
  );
});

/**
 * 规划页负责人列：点头像出成员下拉直接换人（同阶段表格的负责人格子）；没权限只显示头像。
 */
export const PlanOwnerCell = observer(function PlanOwnerCell(
  props: {
    projectId: string;
    size: TSize;
    editable: boolean;
  } & (
    | { multiple: false; value: string | null; onChange: (next: string | null) => void }
    | { multiple: true; value: string[]; onChange: (next: string[]) => void }
  )
) {
  const { t } = useTranslation();
  const ids = props.multiple ? props.value : props.value ? [props.value] : [];
  const avatars = <Avatars userIds={ids} size={props.size} editable={props.editable} />;
  if (!props.editable) return avatars;

  const shared = {
    projectId: props.projectId,
    button: avatars,
    buttonVariant: "transparent-without-text" as const,
    buttonContainerClassName: "flex h-full w-full items-center justify-center",
    className: "h-full w-full",
    placement: "bottom-start" as const,
    placeholder: t(`${I18N}.columns.owner`),
  };
  return props.multiple ? (
    <MemberDropdown {...shared} multiple value={props.value} onChange={props.onChange} />
  ) : (
    <MemberDropdown {...shared} multiple={false} value={props.value} onChange={props.onChange} />
  );
});
