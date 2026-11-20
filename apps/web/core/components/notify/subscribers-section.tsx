/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { useNotifySubscribers } from "@/hooks/use-notify-subscribers";
import type { TNotifyEntityType, TNotifySubscriber } from "@/types/notify";
import { NotifyModeTag } from "./mode-tag";
import { NotifySubscriberFormModal } from "./subscriber-form-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  entityType: TNotifyEntityType;
  entityId: string;
};

const OP_LINK = "text-13 hover:underline";

/**
 * 详情侧栏的「订阅人」区块：姓名 / 接收方式 / 操作。
 * 有对象编辑权限的人可以添加、编辑、移除任何人；其他人只能移除自己。
 */
export const NotifySubscribersSection = observer(function NotifySubscribersSection(props: Props) {
  const { workspaceSlug, projectId, entityType, entityId } = props;
  const { data: currentUser } = useUser();
  const { getUserDetails } = useMember();
  const { subscribers, canManage, addSubscribers, updateSubscriber, removeSubscriber } = useNotifySubscribers(
    workspaceSlug,
    projectId,
    entityType,
    entityId
  );
  /** undefined = 弹窗关着；null = 添加；有值 = 编辑这个人 */
  const [formTarget, setFormTarget] = useState<TNotifySubscriber | null | undefined>(undefined);

  const canTouch = (subscriber: TNotifySubscriber) => canManage || subscriber.subscriber_id === currentUser?.id;

  const handleRemove = async (subscriber: TNotifySubscriber) => {
    try {
      await removeSubscriber(subscriber.id);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "移除失败", message: "请稍后重试" });
    }
  };

  return (
    <div className="flex w-full flex-col gap-2 border-t border-subtle px-1.5 py-5">
      <div className="flex items-center justify-between p-1.5">
        <span className="text-13 font-medium text-secondary">
          订阅人<span className="ml-1.5 font-normal text-tertiary tabular-nums">{subscribers.length}</span>
        </span>
        {canManage && (
          <button type="button" className={`${OP_LINK} font-medium text-accent-primary`} onClick={() => setFormTarget(null)}>
            添加
          </button>
        )}
      </div>

      {subscribers.length === 0 ? (
        <span className="px-1.5 text-13 text-tertiary">暂无订阅人</span>
      ) : (
        <div className="mx-1.5 overflow-hidden rounded-lg border border-subtle">
          <div className="grid grid-cols-[minmax(0,1fr)_64px_68px] items-center gap-x-2.5 bg-layer-1 px-3 py-2 text-12 text-tertiary">
            <span>姓名</span>
            <span>接收方式</span>
            <span>操作</span>
          </div>
          {subscribers.map((subscriber) => {
            const member = getUserDetails(subscriber.subscriber_id);
            const name = member?.display_name ?? subscriber.display_name;
            return (
              <div
                key={subscriber.id}
                className="grid grid-cols-[minmax(0,1fr)_64px_68px] items-center gap-x-2.5 border-t border-subtle px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar name={name} src={getFileURL(member?.avatar_url ?? "")} />
                  <span className="truncate text-13 text-primary">{name}</span>
                </span>
                <NotifyModeTag mode={subscriber.mode} />
                <span className="flex items-center gap-2.5">
                  {canTouch(subscriber) && (
                    <>
                      <button
                        type="button"
                        className={`${OP_LINK} text-accent-primary`}
                        onClick={() => setFormTarget(subscriber)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className={`${OP_LINK} text-secondary hover:text-danger-primary`}
                        onClick={() => void handleRemove(subscriber)}
                      >
                        移除
                      </button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <NotifySubscriberFormModal
        isOpen={formTarget !== undefined}
        projectId={projectId}
        subscriber={formTarget}
        existingIds={subscribers.map((subscriber) => subscriber.subscriber_id)}
        onClose={() => setFormTarget(undefined)}
        onSubmit={async (subscriberIds, mode) => {
          if (formTarget) await updateSubscriber(formTarget.id, mode);
          else await addSubscribers(subscriberIds, mode);
        }}
      />
    </div>
  );
});
