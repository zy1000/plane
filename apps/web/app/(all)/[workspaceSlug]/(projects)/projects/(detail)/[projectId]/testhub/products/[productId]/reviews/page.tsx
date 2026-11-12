import { useParams } from "react-router";
import ReviewsPage from "@/app/(all)/[workspaceSlug]/(projects)/products/[productId]/testhub/reviews/page";

// 项目里看关联产品的用例评审：与产品入口同一个页面。换产品时整页重来（模块树、列表、筛选都是跟着产品走的）
export default function ProjectProductReviewsPage() {
  const { productId } = useParams();

  return <ReviewsPage key={productId} />;
}
