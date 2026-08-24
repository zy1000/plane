import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button as AntButton, Input, Modal, Space, Table, Tooltip, message } from "antd";
import type { TableProps } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { FlaskConical, Plus } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Breadcrumbs, Header } from "@plane/ui";
import { renderFormattedDateTime } from "@plane/utils";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import RepositoryModal from "@/components/qa/repository-modal";
// hooks
import {
  useTemplateCaseRepositories,
  type TTemplateCaseRepository,
} from "@/hooks/store/use-template-case-repositories";

type Props = {
  workspaceSlug: string;
};

export const TemplateCaseRepositoryList = ({ workspaceSlug }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    repositories,
    count,
    page,
    pageSize,
    isLoading,
    error,
    fetchPage,
    refreshCurrentPage,
    deleteRepositories,
  } = useTemplateCaseRepositories(workspaceSlug);

  const [searchInput, setSearchInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TTemplateCaseRepository | null>(null);

  const confirmDelete = (repo: TTemplateCaseRepository) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定删除模板库“${repo.name}”吗？库内的模块与模板用例将一并删除，删除后不可恢复。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteRepositories([repo.id]);
          message.success("删除成功");
        } catch (e: any) {
          message.error(e?.message || e?.detail || e?.error || "删除失败，请稍后重试");
        }
      },
    });
  };

  const columns: TableProps<TTemplateCaseRepository>["columns"] = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      render: (text: string, record) => (
        <Link to={`/${workspaceSlug}/templates/test-cases/${record.id}`} className="cursor-pointer">
          <Tooltip title={text || ""} placement="topLeft">
            <span className="block max-w-[440px] truncate text-primary">{text || "-"}</span>
          </Tooltip>
        </Link>
      ),
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      render: (description: string) => {
        const descriptionText = String(description ?? "").trim();
        if (!descriptionText) return null;
        return (
          <Tooltip title={descriptionText} placement="topLeft">
            <span className="block max-w-[420px] truncate">{descriptionText}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "创建者",
      key: "created_by",
      dataIndex: "created_by",
      width: 180,
      render: (_: unknown, record) =>
        record.created_by?.id ? (
          <MemberDropdown
            multiple={true}
            value={[String(record.created_by.id)]}
            onChange={() => {}}
            disabled={true}
            placeholder={"未知用户"}
            className="w-full text-sm"
            buttonContainerClassName="w-full text-left p-0 cursor-default"
            buttonVariant="transparent-with-text"
            buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
            showUserDetails={true}
            optionsClassName="z-[60]"
          />
        ) : null,
    },
    {
      title: "创建时间",
      key: "created_at",
      dataIndex: "created_at",
      width: 180,
      render: (dateString: string) => renderFormattedDateTime(dateString),
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      render: (_: unknown, record) => (
        <Space>
          <AntButton
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(record);
              setModalOpen(true);
            }}
          />
          <AntButton type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(record)} />
        </Space>
      ),
    },
  ];

  const isEmpty = !isLoading && !error && repositories.length === 0 && !searchInput;

  return (
    <>
      <PageHead title={`${t("workspace_templates.test_cases.title")} - ${t("workspace_templates.title")}`} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={t("workspace_templates.test_cases.title")}
                      icon={<FlaskConical className="size-4 text-secondary" />}
                      isLast
                    />
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem className="gap-2">
              <Input.Search
                allowClear
                placeholder={t("workspace_templates.test_cases.search_placeholder")}
                style={{ width: 220 }}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onSearch={(value) => void fetchPage({ page: 1, search: value.trim() }).catch(() => undefined)}
              />
              <Button
                variant="primary"
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                <Plus className="size-3.5" />
                {t("workspace_templates.test_cases.create")}
              </Button>
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        {error ? (
          <div className="flex h-full min-h-80 items-center justify-center p-6 text-center">
            <div>
              <h2 className="text-14 font-medium text-primary">
                {t("workspace_templates.test_cases.error_title")}
              </h2>
              <p className="mt-1 max-w-sm text-12 text-secondary">{error}</p>
              <Button
                className="mt-4"
                variant="secondary"
                onClick={() => void refreshCurrentPage()}
              >
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : isEmpty ? (
          <div className="flex h-full min-h-80 items-center justify-center p-6">
            <div className="flex max-w-sm flex-col items-center text-center">
              <FlaskConical className="size-12 text-placeholder" strokeWidth={1.25} aria-hidden="true" />
              <h2 className="mt-3 text-16 font-semibold text-primary">
                {t("workspace_templates.test_cases.empty.title")}
              </h2>
              <p className="mt-2 text-13 leading-5 text-secondary">
                {t("workspace_templates.test_cases.empty.description")}
              </p>
              <Button
                className="mt-4"
                variant="primary"
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                <Plus className="size-3.5" />
                {t("workspace_templates.test_cases.create")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="template-case-repository-table min-h-0 flex-1 overflow-auto">
            <style
              dangerouslySetInnerHTML={{
                __html: `
                  .template-case-repository-table .ant-table-thead > tr > th {
                    background: var(--bg-layer-1) !important;
                    border-color: var(--border-subtle) !important;
                    font-size: 13px !important;
                    font-weight: 500 !important;
                    color: var(--text-color-secondary) !important;
                  }
                `,
              }}
            />
            <Table
              dataSource={repositories}
              columns={columns}
              loading={isLoading}
              rowKey="id"
              bordered={true}
              onRow={(record) => ({
                onDoubleClick: () => navigate(`/${workspaceSlug}/templates/test-cases/${record.id}`),
              })}
              pagination={{
                current: page,
                pageSize: pageSize,
                total: count,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
                pageSizeOptions: ["10", "20", "50", "100"],
                onChange: (nextPage, nextSize) =>
                  void fetchPage({ page: nextPage, pageSize: nextSize }).catch(() => undefined),
              }}
            />
          </div>
        )}
      </ContentWrapper>
      <RepositoryModal
        open={modalOpen}
        workspaceSlug={workspaceSlug}
        templateMode
        initialValues={editing}
        onCancel={() => setModalOpen(false)}
        onSuccess={() => void refreshCurrentPage()}
      />
    </>
  );
};
