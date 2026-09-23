import { observer } from "mobx-react";
import { ClipboardCheck } from "lucide-react";
import { useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import {
  STAGE_REVIEWS_HEADER_ACTIONS_ID,
  STAGE_REVIEWS_HEADER_COUNT_ID,
  StageReviewList,
} from "@/components/stage-reviews";
import { useProductsContext } from "../context";

/**
 * 产品详情页的「阶段评审」tab：关联项目里这个产品的全部阶段评审。
 *
 * 整页复用项目侧的阶段评审列表（分组栏 / 摘要 / 表格 / 筛选行 / 显示 / 抽屉），只是作用域换成
 * 产品：「产品」列与分组维换成「项目」，左栏按名字标出产品档案里的当前阶段。页头只留两个挂点，数量
 * 徽章与搜索 / 筛选 / 显示由列表 portal 进来，口径同项目侧 header.tsx。
 *
 * 不额外做前端权限拦截：看不见的产品后端 404（外层 ProductDetailsLayout 已处理），列表接口只回
 * 当前用户在对应项目里能看阶段评审的部分。
 */
export const ProductStageReviewsPage = observer(function ProductStageReviewsPage() {
  const { t } = useTranslation();
  const { workspaceSlug, productId } = useParams();
  const { products } = useProductsContext();
  const slug = workspaceSlug?.toString() ?? "";
  const id = productId?.toString() ?? "";
  const product = products.find((item) => item.id === id);
  const featureTitle = t("workspace_products.navigation.stage_reviews");

  return (
    <>
      <PageHead title={product ? `${featureTitle} - ${product.name}` : featureTitle} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <div className="flex items-center gap-2.5">
                <Breadcrumbs>
                  <Breadcrumbs.Item
                    component={
                      <BreadcrumbLink
                        label={featureTitle}
                        icon={<ClipboardCheck className="size-4 text-tertiary" />}
                        isLast
                      />
                    }
                    isLast
                  />
                </Breadcrumbs>
                <div id={STAGE_REVIEWS_HEADER_COUNT_ID} className="flex items-center" />
              </div>
            </Header.LeftItem>
            <Header.RightItem className="shrink-0">
              <div id={STAGE_REVIEWS_HEADER_ACTIONS_ID} className="flex items-center gap-2" />
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper>
        {slug && id && (
          <StageReviewList
            workspaceSlug={slug}
            scope={{ kind: "product", productId: id, currentStageName: product?.stage_detail?.label ?? null }}
          />
        )}
      </ContentWrapper>
    </>
  );
});
