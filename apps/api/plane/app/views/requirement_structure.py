import base64
import json
from decimal import Decimal

from django.db.models import Count, Prefetch, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission, can_view_product
from plane.app.serializers.requirement_structure import (
    RequirementFieldTemplateSerializer,
    RequirementStructuredDiffEntrySerializer,
    RequirementStructuredRevisionSerializer,
    RequirementStructuredRowCreateSerializer,
    RequirementStructuredRowReorderSerializer,
    RequirementStructuredRowSerializer,
    RequirementStructuredRowUpdateSerializer,
    RequirementStructuredSchemaSerializer,
    RequirementTemplateStatusSerializer,
    RequirementTemplateSchemaSerializer,
    RequirementTemplateWriteSerializer,
    serialize_template_schema,
)
from plane.db.models import (
    Product,
    Requirement,
    RequirementFieldTemplate,
    RequirementStructuredDiffEntry,
    RequirementStructuredField,
    RequirementStructuredRevision,
    RequirementStructuredRow,
)
from plane.utils.requirement_structure import (
    RequirementStructureError,
    create_requirement_template,
    create_structured_row,
    delete_structured_row,
    replace_revision_schema,
    replace_template_schema,
    reorder_structured_row,
    update_requirement_template,
    update_structured_row,
)

from .base import BaseViewSet


def _error_response(exc):
    code = exc.code
    response_status = status.HTTP_400_BAD_REQUEST
    if code in {"REQUIREMENT_DRAFT_EDIT_FORBIDDEN"}:
        response_status = status.HTTP_403_FORBIDDEN
    elif code in {
        "REQUIREMENT_TEMPLATE_STALE",
        "STRUCTURED_REVISION_STALE",
        "STRUCTURED_REVISION_READ_ONLY",
        "STRUCTURED_AUTO_ID_IMMUTABLE",
        "STRUCTURED_FIELD_TYPE_IMMUTABLE",
        "REQUIREMENT_TEMPLATE_TYPE_IMMUTABLE",
    }:
        response_status = status.HTTP_409_CONFLICT
    return Response(
        {"error": exc.message, "code": code, "details": exc.details},
        status=response_status,
    )


def _bounded_int(value, default, minimum, maximum):
    try:
        return min(max(int(value), minimum), maximum)
    except (TypeError, ValueError):
        return default


class ProductStructuredResourceMixin:
    def get_product(self):
        product = Product.objects.filter(
            id=self.kwargs.get("product_id"),
            workspace__slug=self.kwargs.get("slug"),
        ).select_related("workspace").first()
        if product is None or not can_view_product(self.request.user, product):
            return None
        return product


class RequirementFieldTemplateViewSet(ProductStructuredResourceMixin, BaseViewSet):
    serializer_class = RequirementFieldTemplateSerializer
    model = RequirementFieldTemplate

    def get_queryset(self):
        return RequirementFieldTemplate.objects.filter(
            product_id=self.kwargs.get("product_id"),
            product__workspace__slug=self.kwargs.get("slug"),
        ).annotate(
            field_count=Count("fields", filter=Q(fields__deleted_at__isnull=True), distinct=True)
        ).order_by("-updated_at", "name")

    def serialize_detail(self, template, product):
        if not hasattr(template, "field_count"):
            template.field_count = template.fields.count()
        data = self.serializer_class(template, context={"product": product}).data
        schema = serialize_template_schema(template)
        data["fields"] = schema["fields"]
        data["schema"] = schema
        return data

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug, product_id):
        if self.get_product() is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        queryset = self.get_queryset()
        if request.query_params.get("active") == "true":
            queryset = queryset.filter(is_active=True)
        template_type = request.query_params.get("template_type")
        if template_type in {choice for choice, _label in RequirementFieldTemplate.TemplateType.choices}:
            queryset = queryset.filter(template_type=template_type)
        return Response(self.serializer_class(queryset, many=True, context={"product": self.get_product()}).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, product_id, pk):
        product = self.get_product()
        template = self.get_queryset().filter(pk=pk).first()
        if product is None or template is None:
            return Response({"error": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.serialize_detail(template, product))

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug, product_id):
        product = self.get_product()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RequirementTemplateWriteSerializer(data=request.data, context={"product": product})
        serializer.is_valid(raise_exception=True)
        try:
            template = create_requirement_template(product, serializer.validated_data, request.user)
        except RequirementStructureError as exc:
            return _error_response(exc)
        return Response(self.serialize_detail(template, product), status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def update(self, request, slug, product_id, pk):
        product = self.get_product()
        template = self.get_queryset().filter(pk=pk).first()
        if product is None or template is None:
            return Response({"error": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RequirementTemplateWriteSerializer(
            data=request.data,
            context={"product": product, "template": template},
        )
        serializer.is_valid(raise_exception=True)
        revision = serializer.validated_data.get("revision")
        if revision is None:
            return Response({"revision": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            template = update_requirement_template(
                template,
                serializer.validated_data,
                request.user,
                revision,
                replace_fields=True,
            )
        except RequirementStructureError as exc:
            return _error_response(exc)
        return Response(self.serialize_detail(template, product))

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, product_id, pk):
        product = self.get_product()
        template = self.get_queryset().filter(pk=pk).first()
        if product is None or template is None:
            return Response({"error": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RequirementTemplateStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            template = update_requirement_template(
                template,
                {"is_active": serializer.validated_data["is_active"]},
                request.user,
                serializer.validated_data["revision"],
                replace_fields=False,
            )
        except RequirementStructureError as exc:
            return _error_response(exc)
        template.field_count = template.fields.count()
        return Response(self.serializer_class(template, context={"product": product}).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def destroy(self, request, slug, product_id, pk):
        if self.get_product() is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        template = self.get_queryset().filter(pk=pk).first()
        if template is None:
            return Response({"error": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def schema(self, request, slug, product_id, pk):
        product = self.get_product()
        template = self.get_queryset().filter(pk=pk).first()
        if product is None or template is None:
            return Response({"error": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(serialize_template_schema(template))

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def update_schema(self, request, slug, product_id, pk):
        product = self.get_product()
        template = self.get_queryset().filter(pk=pk).first()
        if product is None or template is None:
            return Response({"error": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RequirementTemplateSchemaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            template = replace_template_schema(
                template,
                serializer.validated_data["fields"],
                request.user,
                serializer.validated_data["revision"],
            )
        except RequirementStructureError as exc:
            return _error_response(exc)
        return Response(serialize_template_schema(template))


class RequirementStructuredRevisionViewSet(ProductStructuredResourceMixin, BaseViewSet):
    serializer_class = RequirementStructuredRevisionSerializer
    model = RequirementStructuredRevision

    def get_revision(self, requirement_id, revision_id):
        return (
            RequirementStructuredRevision.objects.filter(
                id=revision_id,
                requirement_id=requirement_id,
                requirement__product_id=self.kwargs.get("product_id"),
                requirement__product__workspace__slug=self.kwargs.get("slug"),
                requirement__type=Requirement.RequirementType.DEVELOPMENT,
                requirement__content_mode=Requirement.ContentMode.STRUCTURED,
            )
            .select_related("requirement", "change", "source_template")
            .prefetch_related(
                Prefetch(
                    "fields",
                    queryset=RequirementStructuredField.objects.select_related("parent_field").order_by(
                        "sort_key", "created_at"
                    ),
                    to_attr="prefetched_fields",
                )
            )
            .first()
        )

    def _ensure(self, requirement_id, revision_id):
        if self.get_product() is None:
            return None
        return self.get_revision(requirement_id, revision_id)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, product_id, requirement_id, revision_id):
        revision = self._ensure(requirement_id, revision_id)
        if revision is None:
            return Response({"error": "Structured revision not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.serializer_class(revision).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def schema(self, request, slug, product_id, requirement_id, revision_id):
        revision = self._ensure(requirement_id, revision_id)
        if revision is None:
            return Response({"error": "Structured revision not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "revision_id": str(revision.id),
                "lock_version": revision.lock_version,
                "fields": [
                    {
                        "key": str(field.field_key),
                        "parent_key": str(field.parent_field.field_key) if field.parent_field_id else None,
                        "name": field.name,
                        "description": field.description,
                        "field_type": field.field_type,
                        "sort_key": str(field.sort_key),
                        "is_required": field.is_required,
                        "is_active": field.is_active,
                        "config": field.config,
                        "validation": field.validation,
                        "options": field.options,
                        "default_value": field.default_value,
                    }
                    for field in revision.prefetched_fields
                ],
            }
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def update_schema(self, request, slug, product_id, requirement_id, revision_id):
        revision = self._ensure(requirement_id, revision_id)
        if revision is None:
            return Response({"error": "Structured revision not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RequirementStructuredSchemaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            revision = replace_revision_schema(
                revision,
                serializer.validated_data["fields"],
                request.user,
                serializer.validated_data["lock_version"],
            )
        except RequirementStructureError as exc:
            return _error_response(exc)
        revision = self.get_revision(requirement_id, revision_id)
        return Response(self.serializer_class(revision).data)

    def _decode_cursor(self, value):
        if not value:
            return None
        try:
            payload = json.loads(base64.urlsafe_b64decode(value.encode()).decode())
            return Decimal(payload[0]), payload[1]
        except Exception:
            return None

    def _encode_cursor(self, row):
        payload = json.dumps([str(row.sort_key), str(row.row_key)]).encode()
        return base64.urlsafe_b64encode(payload).decode()

    def _row_queryset(self, revision, request):
        queryset = revision.rows.select_related("revision", "parent_row", "table_field").prefetch_related(
            "values__field"
        )
        parent_row_key = request.query_params.get("parent_row_key")
        table_field_key = request.query_params.get("table_field_key")
        if parent_row_key or table_field_key:
            if not parent_row_key or not table_field_key:
                return queryset.none()
            queryset = queryset.filter(parent_row__row_key=parent_row_key, table_field__field_key=table_field_key)
        else:
            queryset = queryset.filter(parent_row__isnull=True, table_field__isnull=True)
        cursor = self._decode_cursor(request.query_params.get("cursor"))
        if cursor:
            sort_key, row_key = cursor
            queryset = queryset.filter(Q(sort_key__gt=sort_key) | Q(sort_key=sort_key, row_key__gt=row_key))
        return queryset.order_by("sort_key", "created_at", "id")

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def rows(self, request, slug, product_id, requirement_id, revision_id):
        revision = self._ensure(requirement_id, revision_id)
        if revision is None:
            return Response({"error": "Structured revision not found."}, status=status.HTTP_404_NOT_FOUND)
        page_size = _bounded_int(request.query_params.get("page_size"), 100, 1, 200)
        rows = list(self._row_queryset(revision, request)[: page_size + 1])
        has_more = len(rows) > page_size
        rows = rows[:page_size]
        return Response(
            {
                "revision_id": str(revision.id),
                "lock_version": revision.lock_version,
                "next_cursor": self._encode_cursor(rows[-1]) if has_more and rows else None,
                "data": RequirementStructuredRowSerializer(rows, many=True).data,
            }
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def create_row(self, request, slug, product_id, requirement_id, revision_id):
        revision = self._ensure(requirement_id, revision_id)
        if revision is None:
            return Response({"error": "Structured revision not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RequirementStructuredRowCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            row, revision = create_structured_row(
                revision,
                request.user,
                values=data.get("values"),
                parent_row_key=data.get("parent_row_key"),
                table_field_key=data.get("table_field_key"),
                before_row_key=data.get("before_row_key"),
                after_row_key=data.get("after_row_key"),
                expected_lock_version=data["lock_version"],
            )
        except RequirementStructureError as exc:
            return _error_response(exc)
        row = revision.rows.select_related("revision", "parent_row", "table_field").prefetch_related(
            "values__field"
        ).get(pk=row.pk)
        return Response(
            {"lock_version": revision.lock_version, "row": RequirementStructuredRowSerializer(row).data},
            status=status.HTTP_201_CREATED,
        )

    def _get_row(self, revision, row_key):
        return revision.rows.filter(row_key=row_key).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def update_row(self, request, slug, product_id, requirement_id, revision_id, row_key):
        revision = self._ensure(requirement_id, revision_id)
        if revision is None or self._get_row(revision, row_key) is None:
            return Response({"error": "Structured row not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RequirementStructuredRowUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            row, revision = update_structured_row(
                revision,
                row_key,
                request.user,
                serializer.validated_data["values"],
                serializer.validated_data["lock_version"],
            )
        except RequirementStructureError as exc:
            return _error_response(exc)
        row = revision.rows.select_related("revision", "parent_row", "table_field").prefetch_related(
            "values__field"
        ).get(pk=row.pk)
        return Response({"lock_version": revision.lock_version, "row": RequirementStructuredRowSerializer(row).data})

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def destroy_row(self, request, slug, product_id, requirement_id, revision_id, row_key):
        revision = self._ensure(requirement_id, revision_id)
        if revision is None or self._get_row(revision, row_key) is None:
            return Response({"error": "Structured row not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            revision = delete_structured_row(
                revision,
                row_key,
                request.user,
                request.data.get("lock_version"),
            )
        except RequirementStructureError as exc:
            return _error_response(exc)
        return Response({"lock_version": revision.lock_version}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def reorder_row(self, request, slug, product_id, requirement_id, revision_id, row_key):
        revision = self._ensure(requirement_id, revision_id)
        if revision is None or self._get_row(revision, row_key) is None:
            return Response({"error": "Structured row not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RequirementStructuredRowReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            row, revision = reorder_structured_row(
                revision,
                row_key,
                request.user,
                before_row_key=data.get("before_row_key"),
                after_row_key=data.get("after_row_key"),
                expected_lock_version=data["lock_version"],
            )
        except RequirementStructureError as exc:
            return _error_response(exc)
        return Response(
            {
                "lock_version": revision.lock_version,
                "row": RequirementStructuredRowSerializer(row).data,
            }
        )


class RequirementStructuredDiffViewSet(ProductStructuredResourceMixin, BaseViewSet):
    model = RequirementStructuredDiffEntry

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug, product_id, requirement_id, change_id):
        if self.get_product() is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        requirement = Requirement.objects.filter(
            id=requirement_id,
            product_id=product_id,
            product__workspace__slug=slug,
            type=Requirement.RequirementType.DEVELOPMENT,
        ).first()
        if requirement is None:
            return Response({"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        queryset = RequirementStructuredDiffEntry.objects.filter(
            change_id=change_id,
            change__requirement=requirement,
        )
        scope = request.query_params.get("scope")
        if scope in {choice for choice, _label in RequirementStructuredDiffEntry.Scope.choices}:
            queryset = queryset.filter(scope=scope)
        page_size = _bounded_int(request.query_params.get("page_size"), 100, 1, 200)
        offset = _bounded_int(request.query_params.get("offset"), 0, 0, 10_000_000)
        total = queryset.count()
        page = queryset.order_by("sort_key", "created_at", "id")[offset : offset + page_size]
        return Response(
            {
                "count": total,
                "next_offset": offset + page_size if offset + page_size < total else None,
                "data": RequirementStructuredDiffEntrySerializer(page, many=True).data,
            }
        )
