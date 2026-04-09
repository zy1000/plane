import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
import { Clock } from "lucide-react";
import { Header, Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { useAppRouter } from "@/hooks/use-app-router";

const TAB_ITEMS = [
  { key: "overview", label: "概览", path: "" },
  { key: "manage", label: "填报工时", path: "/manage" },
];

export const WorkspaceTimesheetsHeader = observer(function WorkspaceTimesheetsHeader() {
  const router = useAppRouter();
  const { workspaceSlug } = useParams();
  const pathname = usePathname();

  const basePath = `/${workspaceSlug}/timesheets`;

  // Router 会为路径追加尾部斜杠（compat/next），需先去掉末尾 / 再判断子路径
  const pathForTab = pathname?.replace(/\/$/, "") ?? "";

  const activeTab = (() => {
    if (pathForTab.endsWith("/manage")) return "manage";
    return "overview";
  })();

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-4">
          <Breadcrumbs onBack={router.back}>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="工时管理"
                  href={basePath}
                  icon={<Clock className="h-4 w-4 text-secondary" />}
                  isLast
                />
              }
              isLast
            />
          </Breadcrumbs>
          <div className="flex items-center border-l border-subtle pl-4">
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => router.push(`${basePath}${tab.path}`)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.key
                    ? "bg-accent-primary/10 text-accent-primary"
                    : "text-secondary hover:text-primary hover:bg-layer-1"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </Header.LeftItem>
    </Header>
  );
});
