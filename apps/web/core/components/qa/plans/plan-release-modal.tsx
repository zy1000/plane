"use client";

import React, { useEffect, useRef, useState } from "react";
import { ModalCore, EModalPosition, EModalWidth } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { Row, Col, Table, Tag, message } from "antd";
import { X } from "lucide-react";
import { ReleaseService } from "@/services/release.service";
import { PlanService } from "@/services/qa/plan.service";
import dayjs from "dayjs";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import type { IRelease } from "@plane/types";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  planId?: string;
  onClosed?: () => void;
};

const PlanReleaseModal: React.FC<Props> = (props) => {
  const { isOpen, onClose, onClosed, workspaceSlug, projectId } = props;

  const releaseService = useRef(new ReleaseService()).current;
  const planService = useRef(new PlanService()).current;
  const [releases, setReleases] = useState<IRelease[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchReleases = async (projectId: string) => {
    try {
      setReleasesLoading(true);
      setReleasesError(null);
      const res = await releaseService.getReleases(workspaceSlug, projectId);
      setReleases(Array.isArray(res) ? res : []);
    } catch {
      setReleases([]);
      setReleasesError("发布规划加载失败");
    } finally {
      setReleasesLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !workspaceSlug || !projectId) return;
    fetchReleases(projectId);
    setSelectedRowKeys([]);
  }, [isOpen, workspaceSlug, projectId]);

  const handleClose = () => {
    onClose();
    onClosed?.();
  };

  const handleConfirm = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning("请至少选择一个发布规划");
      return;
    }
    if (!props.planId) {
      message.error("缺少测试计划ID");
      return;
    }

    try {
      setSubmitting(true);
      await planService.associateReleases(workspaceSlug, projectId, {
        plan_id: props.planId,
        release_ids: selectedRowKeys as string[],
      });
      message.success("关联成功");
      handleClose();
    } catch {
      message.error("关联失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const statusMap: Record<string, { label: string; color: string }> = {
    backlog: { label: "未开始", color: "default" },
    planned: { label: "已规划", color: "blue" },
    "in-progress": { label: "进行中", color: "processing" },
    paused: { label: "已暂停", color: "warning" },
    completed: { label: "已完成", color: "success" },
    cancelled: { label: "已取消", color: "error" },
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.VIXL}
    >
      <div className="w-full">
        <div className="flex items-center justify-between gap-4 border-b border-subtle px-6 py-4">
          <h3 className="text-lg font-medium">发布规划</h3>
          <button
            className="flex items-center justify-center rounded p-1 text-secondary hover:bg-surface-3 hover:text-primary transition-colors"
            onClick={handleClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <Row wrap={false} className="h-[70vh] max-h-[70vh] overflow-hidden p-6" gutter={[16, 16]}>
          <Col flex="auto" className="h-full overflow-y-auto">
            <div className="w-full h-full">
              {releasesLoading && (
                <div className="flex items-center justify-center py-12 text-secondary">加载中...</div>
              )}
              {releasesError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800 text-sm m-6">
                  {releasesError}
                </div>
              )}
              {!releasesLoading && !releasesError && releases.length === 0 && (
                <div className="flex items-center justify-center py-12 text-secondary">暂无发布规划</div>
              )}
              {!releasesLoading && !releasesError && releases.length > 0 && (
                <Table
                  dataSource={releases}
                  rowKey="id"
                  pagination={false}
                  rowSelection={{
                    type: "checkbox",
                    selectedRowKeys,
                    onChange: (keys) => setSelectedRowKeys(keys),
                  }}
                  columns={[
                    {
                      title: "名称",
                      dataIndex: "name",
                      key: "name",
                      render: (name) => <span className="text-sm text-primary">{name}</span>,
                    },
                    {
                      title: "状态",
                      dataIndex: "status",
                      key: "status",
                      render: (val: string | undefined) => {
                        const info = statusMap[val ?? ""] ?? { label: val ?? "-", color: "default" };
                        return <Tag color={info.color}>{info.label}</Tag>;
                      },
                    },
                    {
                      title: "负责人",
                      dataIndex: "lead_id",
                      key: "lead_id",
                      render: (uid: string | null) => (
                        <MemberDropdown
                          multiple={false}
                          value={uid ?? null}
                          onChange={() => {}}
                          disabled={true}
                          placeholder={"未指定"}
                          className="w-full text-sm"
                          buttonContainerClassName="w-full text-left p-0 cursor-default"
                          buttonVariant="transparent-with-text"
                          buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
                          showUserDetails={true}
                          optionsClassName="z-[60]"
                        />
                      ),
                    },
                    {
                      title: "开始时间",
                      dataIndex: "start_date",
                      key: "start_date",
                      render: (date: string | null) => (
                        <span className="text-xs text-primary">
                          {date ? dayjs(date).format("YYYY-MM-DD") : "-"}
                        </span>
                      ),
                    },
                    {
                      title: "结束时间",
                      dataIndex: "target_date",
                      key: "target_date",
                      render: (date: string | null) => (
                        <span className="text-xs text-primary">
                          {date ? dayjs(date).format("YYYY-MM-DD") : "-"}
                        </span>
                      ),
                    },
                  ]}
                />
              )}
            </div>
          </Col>
        </Row>
        <div className="sticky bottom-0 w-full bg-surface-1 border-t border-subtle px-6 py-3 flex items-center justify-end gap-3">
          <Button onClick={handleClose}>取消</Button>
          <Button onClick={handleConfirm} loading={submitting}>
            确定
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};

export default PlanReleaseModal;
