/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import type { LucideIcon } from "lucide-react";
import type { IUserLite } from "@plane/types";
import { Avatar, AvatarGroup } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { getUserAvatarFallbackBackgroundColor } from "@/helpers/user-avatar.helper";
import { useMember } from "@/hooks/store/use-member";

/**
 * 创建 / 编辑弹窗右栏的「属性栏」：分组标题 + 一行一项。
 * 值不画成输入框：平时只是一行字，悬停才出底色；空值是灰字占位；点过保存后还缺的必填项整格标红。
 * 产品弹窗、项目弹窗共用。
 */

/** 值按钮：左移 10px，让文字和标签列后的网格线对齐 */
export const PROPERTY_VALUE_CLASS =
  "-ml-2.5 flex h-8 w-[calc(100%+0.625rem)] min-w-0 items-center gap-2 rounded-lg border border-transparent bg-transparent px-2.5 text-left text-14 font-normal text-primary hover:bg-layer-1-hover";
/** 点过保存后仍缺的必填项：整格红底红框，占位换成「请填写 xx」 */
export const PROPERTY_VALUE_ERROR_CLASS = "border-danger-subtle bg-danger-subtle hover:bg-danger-subtle";
/** 只读态的值：和可编辑态同一行高，不带悬停 */
export const PROPERTY_READONLY_CLASS = "flex h-8 min-w-0 items-center gap-2 text-14 text-primary";

export const PropertyRailGroup = ({ title, children }: { title: string; children: ReactNode }) => (
  <section>
    <h3 className="mb-1 text-12 font-semibold tracking-wide text-tertiary">{title}</h3>
    {children}
  </section>
);

type TPropertyRailRowProps = {
  icon: LucideIcon;
  label: string;
  required?: boolean;
  /** 值已填但校验不过（如完成日期早于开始日期）时，在值下方出一行红字；缺值的错误走红色占位，不用这里 */
  error?: string;
  /** 行数少的弹窗可以把行高放宽（如 min-h-11），免得右栏下面空一截 */
  className?: string;
  children: ReactNode;
};

/** 一行一项：图标 + 字段名固定 122px，值在右侧成一列；必填挂红星 */
export const PropertyRailRow = ({
  icon: Icon,
  label,
  required = false,
  error,
  className,
  children,
}: TPropertyRailRowProps) => (
  <div className={cn("grid min-h-9 grid-cols-[122px_minmax(0,1fr)] items-center", className)}>
    <span className="flex min-w-0 items-center gap-2 text-13 text-tertiary">
      <Icon className="size-3.75 shrink-0 text-placeholder" strokeWidth={1.8} />
      <span className="truncate">
        {label}
        {required && <span className="ml-0.5 text-danger-primary">*</span>}
      </span>
    </span>
    <div className="min-w-0">{children}</div>
    {error ? <p className="col-start-2 pb-1 text-12 text-danger-primary">{error}</p> : null}
  </div>
);

export const PeopleValue = ({ users }: { users: IUserLite[] }) =>
  users.length === 1 ? (
    <>
      <Avatar
        name={users[0].display_name}
        src={getFileURL(users[0].avatar_url ?? "")}
        fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor(users[0])}
        showTooltip={false}
      />
      <span className="truncate">{users[0].display_name}</span>
    </>
  ) : (
    <>
      <AvatarGroup max={3} showTooltip={false}>
        {users.map((user) => (
          <Avatar
            key={user.id}
            name={user.display_name}
            src={getFileURL(user.avatar_url ?? "")}
            fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor(user)}
          />
        ))}
      </AvatarGroup>
      <span className="truncate">{users.map((user) => user.display_name).join("、")}</span>
    </>
  );

/** 只读态的人员：没人显示「—」 */
export const ReadonlyPeopleValue = ({ users }: { users: IUserLite[] }) => (
  <span className={PROPERTY_READONLY_CLASS}>{users.length > 0 ? <PeopleValue users={users} /> : "—"}</span>
);

type TMemberValueButtonProps = {
  userIds: string[];
  placeholder: string;
  /** 缺值错误：整格标红、占位换成错误文案 */
  error?: string | null;
};

/** 成员下拉的触发按钮：有人是头像 + 名字，没人是灰字占位，出错是红字 */
export const MemberValueButton = observer(function MemberValueButton(props: TMemberValueButtonProps) {
  const { userIds, placeholder, error } = props;
  const { getUserDetails } = useMember();
  const users = userIds.map((id) => getUserDetails(id)).filter((user): user is IUserLite => Boolean(user));
  return (
    <span className={cn(PROPERTY_VALUE_CLASS, error && PROPERTY_VALUE_ERROR_CLASS)}>
      {users.length > 0 ? (
        <PeopleValue users={users} />
      ) : (
        <span className={cn("truncate", error ? "text-danger-primary" : "text-placeholder")}>
          {error ?? placeholder}
        </span>
      )}
    </span>
  );
});
