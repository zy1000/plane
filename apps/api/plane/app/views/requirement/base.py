"""产品需求：配置（只读）+ 需求条目。

产品级不再有审批配置：评审人与通过规则由提交人在每次提交评审时给定，只对那张变更单
有效。能不能写一条需求由那一行自己决定（在不在评审中），没有产品级的冻结闸门。
"""

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.requirement import (
    RequirementBulkScopeSerializer,
    RequirementRollbackSerializer,
    RequirementScopeWriteSerializer,
    RequirementSerializer,
    RequirementStatusWriteSerializer,
)
from plane.app.permissions.keys import PermissionKey
from plane.app.views.base import BaseAPIView
from plane.app.views.requirement.library_item import get_scoped_library
from plane.app.views.requirement.mixins import (
    can_view_requirements,
    can_write_requirements,
    get_requirement_scope,
    get_scoped_product,
    resolve_row_layer,
)
from plane.app.views.requirement.row_base import (
    BaseRequirementRowViewSet,
    annotate_pending,
)
from plane.db.models import (
    Product,
    Requirement,
    RequirementChangeRequest,
    RequirementChangeStatus,
    RequirementItemStatus,
)
from plane.utils.requirement_change import (
    RequirementChangeError,
    rollback_requirement_to_version,
)
from plane.utils.requirement import (
    RequirementScopeHandle,
    field_specs_for_requirement_types,
    field_tree_from_specs,
    get_referenced_requirement_type_ids,
    requirement_types_field_payload_from_specs,
    scope_row_filter,
)
from plane.utils.requirement_project import (
    annotate_project_ids,
    set_requirement_status,
)
from plane.utils.requirement_scope import (
    RequirementScopeError,
    bulk_set_requirement_scope,
    convert_to_own,
    get_product_scope,
    has_references,
    mark_references,
    next_converted_display_id,
    product_rows_queryset,
    referenced_requirement_ids,
    scope_overview,
    scope_product_ids_map,
    set_requirement_scope,
    with_referenced_types,
)


class RequirementConfigurationAPIView(BaseAPIView):
    """需求配置：写权限、待审计数，以及网格要用的字段与需求类型视图。只读。

    字段一律实时取自被引用的需求类型 —— 没有 is_frozen 这个态了，字段结构变更立即
    生效，历史版本的渲染依据由 RequirementTypeSchemaRevision 保住。
    """

    def get(self, request, slug, product_id):
        product = get_scoped_product(request.user, slug=slug, product_id=product_id)
        if product is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        # 能看到产品但没有「需求 · 查看」：结构照旧、内容全空，前端按 can_view 显示无权限
        if not can_view_requirements(request.user, product):
            return Response(
                {
                    "can_view": False,
                    "can_edit": False,
                    "can_create": False,
                    "can_delete": False,
                    "can_manage_modules": False,
                    "can_submit_review": False,
                    "can_manage_baselines": False,
                    "pending_change_request_count": 0,
                    "requirement_types": [],
                    "fields": [],
                },
                status=status.HTTP_200_OK,
            )

        # 一个产品下的需求可能分属多个类型：requirement_types 供数据页分视图，
        # fields 保留成扁平并集，让变更记录那个 tab 完全不用改。
        # 引用了产品集需求的产品：那些需求的类型也要出视图和字段列
        requirement_type_ids = get_referenced_requirement_type_ids(
            model=Requirement,
            scope=scope_row_filter(RequirementScopeHandle.for_product(product)),
            queryset=product_rows_queryset(product) if has_references(product) else None,
        )
        specs, by_requirement_type = field_specs_for_requirement_types(
            requirement_type_ids
        )
        return Response(
            {
                "can_view": True,
                "can_edit": can_write_requirements(request.user, product),
                # 下面几个按动作拆开，前端按钮显隐直接读；项目侧的 configuration 恒 false
                "can_create": can_write_requirements(
                    request.user, product, PermissionKey.PROJECT_REQUIREMENT_CREATE
                ),
                "can_delete": can_write_requirements(
                    request.user, product, PermissionKey.PROJECT_REQUIREMENT_DELETE
                ),
                "can_manage_modules": can_write_requirements(
                    request.user, product, PermissionKey.PROJECT_REQUIREMENT_MODULE_MANAGE
                ),
                "can_submit_review": can_write_requirements(
                    request.user, product, PermissionKey.PROJECT_CHANGE_REQUEST_CREATE
                ),
                "can_manage_baselines": can_write_requirements(
                    request.user, product, PermissionKey.PROJECT_REQUIREMENT_BASELINE_MANAGE
                ),
                # 现在一个产品下可以同时有多张待审单，所以给计数而不是单个 id
                "pending_change_request_count": RequirementChangeRequest.objects.filter(
                    product=product, status=RequirementChangeStatus.PENDING
                ).count(),
                "requirement_types": requirement_types_field_payload_from_specs(
                    requirement_type_ids, by_requirement_type
                ),
                "fields": field_tree_from_specs(specs),
            },
            status=status.HTTP_200_OK,
        )


class RequirementViewSet(BaseRequirementRowViewSet):
    """产品下的需求条目。"""

    NOT_FOUND = "Product not found."
    FORBIDDEN = "You do not have permission to maintain product requirements."

    def resolve_owner(self, *, for_update=False):
        """归属对象是作用域句柄 —— 它挂着 product，写路径用 for_update 锁产品行。"""
        _, scope = get_requirement_scope(
            self.request.user,
            slug=self.workspace_slug,
            product_id=self.kwargs.get("product_id"),
            for_update=for_update,
        )
        return scope

    def can_write(self, owner, permission_key=None):
        return can_write_requirements(self.request.user, owner.product, permission_key)

    def can_read(self, owner):
        return can_view_requirements(self.request.user, owner.product)

    def resolve_layer(self, owner):
        return with_referenced_types(resolve_row_layer(owner), owner.product)

    # --- 产品集：引用进来的需求只进读路径（utils/requirement_scope.py） -------------

    def list_base_queryset(self, owner, layer):
        if not owner.product.product_set_id:
            return layer.queryset
        return product_rows_queryset(owner.product)

    def apply_scope_filters(self, request, queryset):
        """?source=own|referenced：产品需求页的「自有 / 引用」分段。"""
        source = request.query_params.get("source")
        product_id = self.kwargs.get("product_id")
        if source == "own":
            return queryset.filter(product_id=product_id)
        if source == "referenced":
            return queryset.filter(id__in=referenced_requirement_ids(product_id))
        return queryset

    def prepare_rows(self, owner, rows):
        if not owner.product.product_set_id:
            return rows
        return mark_references(rows, owner.product.id)

    def _row_context(self, layer, owner, rows):
        context = super()._row_context(layer, owner, rows)
        product = owner.product
        if product.is_set:
            # 产品集的需求列表带「使用范围」列
            context["scope_product_ids"] = scope_product_ids_map(
                (row.id for row in rows), product, self.request.user
            )
        elif product.product_set_id:
            context["row_scope_identifiers"] = self.row_scope_identifiers(owner)
        return context

    def row_scope_identifiers(self, owner):
        # 引用行的编号前缀是产品集的，不是本产品的
        product = owner.product
        if not product.product_set_id:
            return None
        return {
            product.id: product.identifier,
            product.product_set_id: product.product_set.identifier,
        }

    def resolve_library(self, library_id):
        return get_scoped_library(
            slug=self.workspace_slug,
            library_id=library_id,
        )

    def excel_filename_stem(self, owner, layer):
        return owner.product.name or super().excel_filename_stem(owner, layer)

    has_extra_annotations = True

    def annotate_extra(self, queryset):
        # 需求详情的「所属项目」多选要拿到这条需求进了哪些项目
        return annotate_project_ids(queryset)

    def get_queryset(self):
        return (
            Requirement.objects.filter(
                product_id=self.kwargs.get("product_id"),
                product__workspace__slug=self.workspace_slug,
            )
            .select_related("product")
            .order_by("sort_order", "created_at", "id")
        )

    def rollback(self, request, *args, pk=None, **kwargs):
        """把某个已通过版本的内容拷回这一行。

        回滚**不撤销审批**：写完这条需求是 modified，要不要真的退回那一版由随后的评审
        决定。所以这里走的是普通的写权限，与 PATCH 一致。
        """
        serializer = RequirementRollbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer = self.resolve_layer(owner)
        with transaction.atomic():
            row = layer.queryset.select_for_update().filter(id=pk).first()
            if row is None:
                return Response(
                    {"error": "Requirement not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            # 已关闭的需求内容只读，用户发起的回滚也算内容写入。拦在视图层而不是
            # util 里：驳回时的系统性还原（_revert_rejected_items）复用同一个 util，
            # 不该被 closed 挡住
            if row.status == RequirementItemStatus.CLOSED:
                return self._closed_response([row.id])
            try:
                rollback_requirement_to_version(
                    requirement=row,
                    version_number=serializer.validated_data["version"],
                    actor=request.user,
                )
            except RequirementChangeError as exc:
                payload = {"error": str(exc), "code": exc.code}
                payload.update(exc.detail or {})
                return Response(payload, status=status.HTTP_409_CONFLICT)
        return Response(
            RequirementSerializer(
                row, context=self._row_context(layer, owner, [row])
            ).data,
            status=status.HTTP_200_OK,
        )

    def set_status(self, request, *args, pk=None, **kwargs):
        """需求级交付状态的写入口（产品侧）。与内容 PATCH 分开：不带 version、不进
        内容 diff、评审中的行也能改；closed 行改成任意非 closed 值即重开。
        项目侧对应的入口是 ProjectRequirementViewSet.partial_update。
        """
        serializer = RequirementStatusWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer = self.resolve_layer(owner)
        if not layer.queryset.filter(id=pk).exists():
            return Response(
                {"error": "Requirement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        set_requirement_status(
            pk, status=serializer.validated_data["status"], actor=request.user
        )
        # 重读要带上 annotate_pending：评审中的行也能改状态，响应缺了
        # pending_change_request_id 前端的「撤回」入口会消失
        row = (
            self.annotate_extra(annotate_pending(layer.queryset)).filter(id=pk).first()
        )
        return Response(
            RequirementSerializer(
                row, context=self._row_context(layer, owner, [row])
            ).data,
            status=status.HTTP_200_OK,
        )

    # --- 产品集侧：使用范围 -------------------------------------------------

    def _set_requirement_or_error(self, owner, pk):
        """使用范围只对产品集里的需求有意义。返回 (需求行, error_response)。"""
        row = (
            Requirement.objects.filter(product_id=owner.product.id, id=pk).first()
            if owner.product.is_set
            else None
        )
        if row is None:
            return None, Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        return row, None

    def scope(self, request, *args, pk=None, **kwargs):
        """使用范围浮层：集内每个产品勾没勾、它那一份的状态、是否已转为自有。"""
        owner, error = self._owner_or_error(require_write=False)
        if error is not None:
            return error
        row, error = self._set_requirement_or_error(owner, pk)
        if error is not None:
            return error
        return Response({"products": scope_overview(owner.product, row, request.user)}, status=status.HTTP_200_OK)

    def set_scope(self, request, *args, pk=None, **kwargs):
        """把使用范围整份换成请求里的产品。不算内容：不进评审、不动 version。"""
        serializer = RequirementScopeWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            # 锁产品集这一行：与「转为自有」取副编号、往集里加减产品互斥
            owner, error = self._owner_or_error(for_update=True)
            if error is not None:
                return error
            row, error = self._set_requirement_or_error(owner, pk)
            if error is not None:
                return error
            try:
                set_requirement_scope(
                    owner.product, row, serializer.validated_data["product_ids"], request.user
                )
            except RequirementScopeError as exc:
                return Response(exc.payload(), status=exc.status)
        return Response(
            {
                "scope_product_ids": [
                    str(pid)
                    for pid in scope_product_ids_map([row.id], owner.product, request.user).get(row.id, [])
                ],
                "products": scope_overview(owner.product, row, request.user),
            },
            status=status.HTTP_200_OK,
        )

    def bulk_scope(self, request, *args, **kwargs):
        """批量设置使用范围（产品集需求列表勾选多行后用）。"""
        serializer = RequirementBulkScopeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            owner, error = self._owner_or_error(for_update=True)
            if error is not None:
                return error
            if not owner.product.is_set:
                return Response({"error": "Product set not found."}, status=status.HTTP_404_NOT_FOUND)
            try:
                result = bulk_set_requirement_scope(
                    owner.product, data["requirement_ids"], data["product_ids"], data["mode"], request.user
                )
            except RequirementScopeError as exc:
                return Response(exc.payload(), status=exc.status)
        return Response(
            {
                **result,
                "scope_product_ids": {
                    str(requirement_id): [str(pid) for pid in product_ids]
                    for requirement_id, product_ids in scope_product_ids_map(
                        data["requirement_ids"], owner.product, request.user
                    ).items()
                },
            },
            status=status.HTTP_200_OK,
        )

    # --- 产品侧：引用的需求 -------------------------------------------------

    def _reference_response(self, owner, requirement_id, status_code=status.HTTP_200_OK):
        """按列表同一口径（盖上本产品那一份）重读这一行。"""
        layer = self.resolve_layer(owner)
        row = (
            self.annotate_extra(annotate_pending(self.list_base_queryset(owner, layer)))
            .filter(id=requirement_id)
            .first()
        )
        return Response(
            RequirementSerializer(row, context=self._row_context(layer, owner, [row])).data,
            status=status_code,
        )

    def preview_convert(self, request, *args, pk=None, **kwargs):
        """转为自有的确认框：转换后的编号。"""
        owner, error = self._owner_or_error(require_write=False)
        if error is not None:
            return error
        product_scope = get_product_scope(owner.product, pk)
        if product_scope is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {"display_id": next_converted_display_id(product_scope.requirement)}, status=status.HTTP_200_OK
        )

    def convert_reference(self, request, *args, pk=None, **kwargs):
        """转为自有：复制成本产品自己的需求（编号 MP01-3-1），并从使用范围里拿掉本产品。"""
        not_found = Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            # 加锁顺序与改使用范围、产品集加减产品一致：产品集 → 本产品 → 范围行，免得互相死锁。
            # 产品集锁住副编号；本产品锁住 sequence_id。
            owner, error = self._owner_or_error(permission_key=PermissionKey.PROJECT_REQUIREMENT_CREATE)
            if error is not None:
                return error
            product_set_id = owner.product.product_set_id
            if product_set_id is None:
                return not_found
            Product.objects.select_for_update(of=("self",)).filter(id=product_set_id).first()
            owner, error = self._owner_or_error(
                for_update=True, permission_key=PermissionKey.PROJECT_REQUIREMENT_CREATE
            )
            if error is not None:
                return error
            # 两次取之间本产品可能被移出了产品集
            if owner.product.product_set_id != product_set_id:
                return not_found
            product_scope = get_product_scope(owner.product, pk, for_update=True)
            if product_scope is None or product_scope.requirement.product_id != product_set_id:
                return not_found
            row = convert_to_own(scope_handle=owner, product_scope=product_scope, actor=request.user)
        return self._reference_response(owner, row.id, status.HTTP_201_CREATED)

    def importable_library_items(self, request, *args, **kwargs):
        """本产品「还没导过」的标准库条目，按库分组，每条只带 id 与所属模块。

        导入弹窗要三样东西：每个节点还剩多少可导、勾某个节点时那一批 id、以及据此
        算出的三态。它们都要在弹窗打开的一瞬间就位（条目列表是分页的，凑不出全量），
        所以一次把全工作区的库都算出来，而不是每个库发一次请求。

        带上 module_id 是为了让左侧那棵「需求类型 → 标准库 → 模块」树能在前端把可导
        条目按模块归堆：模块树本身另有接口（且它的 count 是库内全量，不排除已导入的），
        光有树算不出「这个模块还剩几条可导」。module_id 为 null 即「未归类」。

        只吐 id + module_id，不序列化整行 —— 行的内容由条目列表接口分页给出。
        """
        owner, error = self._owner_or_error(require_write=False)
        if error is not None:
            return error

        # 已导入的 (库, 库内序号)。产品需求指不回条目 UUID，只有这对逻辑编号
        imported = set(
            Requirement.objects.filter(
                product_id=owner.product_id,
                source_library_id__isnull=False,
            ).values_list("source_library_id", "source_sequence_id")
        )
        grouped = {}
        for library_id, item_id, sequence_id, module_id in (
            Requirement.objects.filter(
                library__isnull=False,
                library__workspace__slug=self.workspace_slug,
            )
            .order_by("library_id", "sort_order", "created_at", "id")
            .values_list("library_id", "id", "sequence_id", "module_id")
        ):
            items = grouped.setdefault(str(library_id), [])
            if (library_id, sequence_id) in imported:
                continue
            items.append(
                {
                    "id": str(item_id),
                    "module_id": str(module_id) if module_id else None,
                }
            )

        return Response(
            [
                {"library_id": library_id, "items": items}
                for library_id, items in grouped.items()
            ],
            status=status.HTTP_200_OK,
        )
