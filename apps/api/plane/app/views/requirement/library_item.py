"""标准库的条目：库直接持有的一批需求。

与产品需求相比少了三件事 —— 没有工作副本、没有只读态、没有产品级权限；
字段来自库所选的需求类型，只能在需求类型页改。
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.requirement import RequirementSerializer
from plane.app.serializers.requirement_library import RequirementLibrarySerializer
from plane.app.views.base import BaseAPIView
from plane.app.views.requirement.mixins import (
    RequirementTypeResolver,
    RowLayer,
    builtin_ids_by_type,
)
from plane.app.views.requirement.row_base import BaseRequirementRowViewSet
from plane.db.models import Requirement, RequirementLibrary
from plane.utils.requirement import (
    get_library_field_specs,
    insert_library_item,
    save_library_item_batch,
    serialize_library_field_tree,
)


def _no_change_kind(rows):
    rows = list(rows)
    for row in rows:
        row.change_kind = None
    return rows


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

    def resolve_owner(self, *, for_update=False):
        return get_scoped_library(
            slug=self.workspace_slug,
            library_id=self.kwargs.get("library_id"),
            for_update=for_update,
        )

    def can_write(self, owner):
        # 库是工作区级资源，口径与需求类型一致：工作区成员即可维护
        return True

    def resolve_layer(self, owner, *, for_write):
        fields = get_library_field_specs(owner)
        fields_by_requirement_type = {str(owner.requirement_type_id): fields}
        return (
            RowLayer(
                queryset=Requirement.objects.filter(library=owner).order_by(
                    "sort_order", "created_at", "id"
                ),
                serializer_class=RequirementSerializer,
                serializer_context={
                    "builtin_field_ids_by_type": builtin_ids_by_type(
                        fields_by_requirement_type
                    ),
                },
                requirement_type_ids=[owner.requirement_type_id],
                fields=fields,
                fields_by_requirement_type=fields_by_requirement_type,
                requirement_type_resolver=RequirementTypeResolver(
                    workspace_id=owner.workspace_id,
                    allowed_requirement_type_id=owner.requirement_type_id,
                ),
                # 库固定一个需求类型，条目不需要（也不允许）自己指定
                default_requirement_type_id=owner.requirement_type_id,
                # 乐观锁基准取需求类型而不是库：改字段动的是类型行，库行的 updated_at
                # 不会变，用库的值会让「字段被人改了」这种冲突漏过去。
                expected_updated_at=owner.requirement_type.updated_at,
                is_frozen=False,
                insert=lambda **kwargs: insert_library_item(library=owner, **kwargs),
                save_batch=lambda **kwargs: save_library_item_batch(
                    library=owner, **kwargs
                ),
                import_items=None,
                hard_delete=False,
                # 库不走审批，没有「相对上一版」这回事
                annotate_change_kind=_no_change_kind,
            ),
            None,
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
