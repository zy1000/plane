import type { IUserLite } from "@plane/types";
import { Avatar, AvatarGroup } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";

/** 名单拼成一句话里的名字：「张三、李四」 */
export const joinPeopleNames = (users: IUserLite[]) => users.map((user) => user.display_name).join("、");

// 字号与文字色写成整串：两个都是 text-*，过 cn() 会被当成同一组互相吞掉
const NAME_CLASS = { sm: "truncate text-13 text-secondary", md: "truncate text-14 text-primary" };
const EMPTY_CLASS = { sm: "truncate text-13 text-placeholder", md: "truncate text-14 text-placeholder" };
const EMPTY_ICON_CLASS = { sm: "size-5", md: "size-6" };

/**
 * 负责人 / 审核者名单的只读展示：一个人是头像 + 名字，多个人是叠放头像 + 「张三、李四」
 * （放不下截断，悬停看全），没有人是虚线圈 + 「未指定」。
 *
 * 直接用接口带回来的用户画，不查成员 store —— 产品页的评审横跨多个项目，store 里不一定有。
 */
export const StageReviewPeople = ({
  users,
  unassigned,
  size = "sm",
  showEmptyIcon = true,
}: {
  users: IUserLite[];
  unassigned: string;
  size?: "sm" | "md";
  /** 没有人时要不要画虚线圈；抽屉属性栏里不画，免得和上下的值错开 */
  showEmptyIcon?: boolean;
}) => {
  if (users.length === 0) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        {showEmptyIcon && (
          <span className={cn("shrink-0 rounded-full border border-dashed border-strong", EMPTY_ICON_CLASS[size])} />
        )}
        <span className={EMPTY_CLASS[size]}>{unassigned}</span>
      </span>
    );
  }

  if (users.length === 1) {
    const [user] = users;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <Avatar size={size} name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} />
        <span className={NAME_CLASS[size]}>{user.display_name}</span>
      </span>
    );
  }

  const names = joinPeopleNames(users);
  return (
    <span className="flex min-w-0 items-center gap-2" title={names}>
      <span className="shrink-0">
        <AvatarGroup size={size} max={2} showTooltip={false}>
          {users.map((user) => (
            <Avatar key={user.id} size={size} name={user.display_name} src={getFileURL(user.avatar_url ?? "")} />
          ))}
        </AvatarGroup>
      </span>
      <span className={NAME_CLASS[size]}>{names}</span>
    </span>
  );
};
