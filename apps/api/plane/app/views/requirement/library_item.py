"""标准库的条目：库直接持有的一批需求。

与产品需求相比少了两件事 —— 不走审批、没有产品级权限；字段来自库所选的需求类型，
只能在需求类型页改。「库条目永不走审批」由 Requirement 上的
req_library_item_never_approved 约束硬保证；status 等四个执行期列在库里既不展示
也不开写入口（见 LIBRARY_HIDDEN_BUILTIN_COLUMNS，库条目的 status 恒为默认值）。
"""

from django.db.models import Exists, OuterRef
from rest_framework import status
from rest_framework import serializers as drf_serializers
from rest_framework.response import Response

from plane.app.serializers.requirement_library import RequirementLibrarySerializer
from plane.app.views.base import BaseAPIView
from plane.app.views.requirement.mixins import (
    RequirementTypeResolver,
    RowLayer,
    get_scoped_product,
)
from plane.app.views.requirement.row_base import BaseRequirementRowViewSet
from plane.db.models import Requirement, RequirementLibrary
from plane.utils.requirement import (
    get_library_field_specs,
    insert_library_item,
    save_library_item_batch,
    serialize_library_field_tree,
)


def get_scoped_library(*, slug, library_id, for_update=False):
    queryset = RequirementLibrary.objects.filter(
        id=library_id,
        workspace__slug=slug,
    ).select_related("workspace", "requirement_type")
    if for_update:
        queryset = queryset.select_for_update(of=("self",))
    return queryset.first()


class RequirementLibraryConfigurationAPIView(BaseAPIView):
    """条目网格的表头：库信息 + 字段树。

    没有 PUT —— 字段属于库所选的需求类型，改字段要去需求类型的配置接口。
    """

    def get(self, request, slug, library_id):
        library = get_scoped_library(slug=slug, library_id=library_id)
        if library is None:
            return Response(
                {"error": "Requirement library not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            {
                "library": RequirementLibrarySerializer(
                    library,
                    context={"request": request, "workspace": library.workspace},
                ).data,
                "fields": serialize_library_field_tree(library),
                # 乐观锁基准取需求类型而不是库：改字段动的是类型行，库行的 updated_at
                # 不会变，用库的值会让「字段被人改了」这种冲突漏过去。
                "expected_updated_at": library.requirement_type.updated_at,
            },
            status=status.HTTP_200_OK,
        )


class RequirementLibraryItemViewSet(BaseRequirementRowViewSet):
    NOT_FOUND = "Requirement library not found."
    FORBIDDEN = "You do not have permission to maintain this library."

    #: 库是模板：内置列只出标题/描述/优先级/父项，也没有交付状态那一列
    excel_is_library = True

    def excel_filename_stem(self, owner, layer):
        return owner.name or super().excel_filename_stem(owner, layer)

    def excel_import_type_ids(self, owner, layer):
        # 库固定绑一个需求类型，条目不能是别的类型 —— 这里不放开到工作区全量
        return [owner.requirement_type_id]

    def resolve_owner(self, *, for_update=False):
        return get_scoped_library(
            slug=self.workspace_slug,
            library_id=self.kwargs.get("library_id"),
            for_update=for_update,
        )

    def can_write(self, owner):
        # 库是工作区级资源，口径与需求类型一致：工作区成员即可维护
        return True

    def resolve_layer(self, owner):
        fields = get_library_field_specs(owner)
        fields_by_requirement_type = {str(owner.requirement_type_id): fields}
        return RowLayer(
            queryset=Requirement.objects.filter(library=owner).order_by(
                "sort_order", "created_at", "id"
            ),
            # 库内条目的展示编号前缀（SEC-12 里的 SEC）
            serializer_context={"scope_identifier": owner.identifier},
            requirement_type_ids=[owner.requirement_type_id],
            fields=fields,
            fields_by_requirement_type=fields_by_requirement_type,
            requirement_type_resolver=RequirementTypeResolver(
                workspace_id=owner.workspace_id,
                allowed_requirement_type_id=owner.requirement_type_id,
            ),
            # 库固定一个需求类型，条目不需要（也不允许）自己指定
            default_requirement_type_id=owner.requirement_type_id,
            insert=lambda **kwargs: insert_library_item(library=owner, **kwargs),
            save_batch=lambda **kwargs: save_library_item_batch(
                library=owner, **kwargs
            ),
            import_items=None,
        )

    def apply_scope_filters(self, request, queryset):
        """?exclude_imported_into_product=<uuid>：藏掉已经导进该产品的条目。

        导入弹窗用这个参数，让候选池里只剩「还没导过的」。必须在服务端做 ——
        条目是游标分页的，前端就地剔除会让某一页只剩几行、总数也偏大。

        产品需求指不回具体条目的 UUID（一条库条目可以被导入无数次），只留了
        (source_library_id, source_sequence_id) 这对逻辑编号，所以这里按序号排除；
        queryset 已经锁定在本库，库内 sequence_id 唯一，够用。
        产品那条需求被删（软删）之后这里会重新出现 —— 它的来源记录也确实随之没了。

        这只是**读时快照**，挡不住并发：两个人同时打开弹窗都会看到「可导」。真正的
        闸门在写侧 —— BaseRequirementRowViewSet.import_from_library 拿到作用域写锁
        之后会再判一次，重复的整批报 409。这里的过滤只负责让候选列表干净。
        """
        product_id = request.query_params.get("exclude_imported_into_product")
        if not product_id:
            return queryset
        # 脏参数不要打到数据库：非法 UUID 直接 400，与 list() 里 ?ids= 的口径一致
        product_id = drf_serializers.UUIDField().run_validation(product_id)
        # 库是工作区级资源（can_write 恒 True），产品不是。不校验可见性的话，
        # 同工作区但看不到该产品的人能借这个参数探出产品导过哪些标准
        if get_scoped_product(
            self.request.user, slug=self.workspace_slug, product_id=product_id
        ) is None:
            raise drf_serializers.ValidationError(
                {"exclude_imported_into_product": "Product not found."}
            )
        # 用 ~Exists 而不是 sequence_id__in=[...]：后者生成 NOT IN，Postgres 因为
        # NULL 语义没法把它优化成 anti-join，只能走 SubPlan 逐行比
        return queryset.exclude(
            Exists(
                Requirement.objects.filter(
                    product_id=product_id,
                    source_library_id=self.kwargs.get("library_id"),
                    source_sequence_id=OuterRef("sequence_id"),
                )
            )
        )

    def get_queryset(self):
        return (
            Requirement.objects.filter(
                library_id=self.kwargs.get("library_id"),
                library__workspace__slug=self.workspace_slug,
            )
            .select_related("library")
            .order_by("sort_order", "created_at", "id")
        )
