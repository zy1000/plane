# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""IssueComplexFilterBackend

Extends ComplexFilterBackend to handle `customproperty_<field_id>__<op>` filter
keys by translating them into subquery Q-objects against TypeExtraFieldValue.

Supported field types and operators
------------------------------------
text    → value_text  : exact, not_exact, contains, not_contains
number  → value_number: exact, not_exact, lt, not_lt, lte, not_lte,
                        gt, not_gt, gte, not_gte, range, not_range
date    → value_date  : exact, not_exact, lt, not_lt, lte, not_lte,
                        gt, not_gt, gte, not_gte, range, not_range
boolean → value       : exact, not_exact  (JSON field, value coerced to bool)
select  → value       : exact, not_exact (single), in, not_in (multi)
user    → value       : exact, not_exact (single), in, not_in (multi)

Negated operators (`not_*`) translate to `~Q(pk__in=subquery)` so that
work items without any value for the field are also returned.
"""

from decimal import Decimal, InvalidOperation

from django.db.models import Q
from rest_framework.exceptions import ValidationError as DRFValidationError

from plane.db.models import TypeExtraField, TypeExtraFieldValue

from .filter_backend import ComplexFilterBackend

# Operators that should negate the subquery (i.e. ~Q(pk__in=...))
_NEGATED_OPS = frozenset({
    "not_exact",
    "not_in",
    "not_contains",
    "not_lt",
    "not_lte",
    "not_gt",
    "not_gte",
    "not_range",
})

# Maps each negated operator to its positive counterpart
_POSITIVE_OF = {
    "not_exact": "exact",
    "not_in": "in",
    "not_contains": "contains",
    "not_lt": "lt",
    "not_lte": "lte",
    "not_gt": "gt",
    "not_gte": "gte",
    "not_range": "range",
}


class IssueComplexFilterBackend(ComplexFilterBackend):
    CUSTOM_PROP_PREFIX = "customproperty_"

    # ------------------------------------------------------------------ #
    # Validation: allow customproperty_* through the allowlist check       #
    # ------------------------------------------------------------------ #

    def _validate_fields(self, filter_data, view):
        """Override to exclude customproperty_* keys from FilterSet validation."""
        filterset_class = getattr(view, "filterset_class", None)
        allowed_fields = set(filterset_class.base_filters.keys()) if filterset_class else None
        if not allowed_fields:
            raise DRFValidationError(
                {
                    "message": "Filtering is not enabled for this endpoint (missing filterset_class)",
                    "code": "filtering_not_enabled",
                }
            )

        fields = self._extract_field_names(filter_data)
        for field in fields:
            # Skip customproperty_* — these are validated at query time
            if field.startswith(self.CUSTOM_PROP_PREFIX):
                continue
            if field not in allowed_fields:
                raise DRFValidationError(
                    {
                        "message": f"Filtering on field '{field}' is not allowed",
                        "code": "invalid_filter_field",
                    }
                )

    # ------------------------------------------------------------------ #
    # Leaf building: separate standard from custom conditions              #
    # ------------------------------------------------------------------ #

    def _build_leaf_q(self, leaf_conditions, view, queryset):
        custom = {k: v for k, v in leaf_conditions.items() if k.startswith(self.CUSTOM_PROP_PREFIX)}
        standard = {k: v for k, v in leaf_conditions.items() if k not in custom}

        q = super()._build_leaf_q(standard, view, queryset) if standard else Q()

        for key, value in custom.items():
            q &= self._build_custom_property_q(key, value, view)

        return q

    # ------------------------------------------------------------------ #
    # Custom property Q-object builder                                     #
    # ------------------------------------------------------------------ #

    def _build_custom_property_q(self, key: str, value, view) -> Q:
        """Translate a customproperty_<field_id>__<op> condition to a Q-object.

        Negated operators (not_*) produce ~Q(pk__in=subquery) so that work
        items with no value for the field are also matched.
        """
        # Parse key: customproperty_<field_id>__<op>
        without_prefix = key[len(self.CUSTOM_PROP_PREFIX):]
        double_underscore = without_prefix.rfind("__")
        if double_underscore == -1:
            raise DRFValidationError(
                {
                    "message": f"Invalid custom property filter key format: '{key}'",
                    "code": "invalid_custom_property_key",
                }
            )

        field_id = without_prefix[:double_underscore]
        op = without_prefix[double_underscore + 2:]

        project_id = view.kwargs.get("project_id")

        field = (
            TypeExtraField.objects.filter(
                id=field_id,
                project_id=project_id,
                is_active=True,
                deleted_at__isnull=True,
            )
            .first()
        )

        if field is None:
            raise DRFValidationError(
                {
                    "message": f"Custom property '{field_id}' not found or not active",
                    "code": "custom_property_not_found",
                }
            )

        is_negated = op in _NEGATED_OPS
        positive_op = _POSITIVE_OF.get(op, op)

        lookup_q = self._build_field_lookup_q(field, positive_op, value)
        subquery = TypeExtraFieldValue.objects.filter(
            extra_field_id=field_id,
            deleted_at__isnull=True,
        ).filter(lookup_q).values("issue_id")

        return ~Q(pk__in=subquery) if is_negated else Q(pk__in=subquery)

    def _build_field_lookup_q(self, field: TypeExtraField, op: str, value) -> Q:
        field_type = field.field_type

        if field_type == "text":
            return self._text_q(op, value)
        if field_type == "number":
            return self._number_q(op, value)
        if field_type == "date":
            return self._date_q(op, value)
        if field_type == "boolean":
            return self._boolean_q(op, value)
        if field_type in ("select", "user"):
            return self._json_value_q(op, value, field)

        raise DRFValidationError(
            {
                "message": f"Unsupported custom property field type: '{field_type}'",
                "code": "unsupported_field_type",
            }
        )

    # ------------------------------------------------------------------ #
    # Per-type lookup helpers (positive operators only)                    #
    # ------------------------------------------------------------------ #

    def _text_q(self, op: str, value) -> Q:
        if op == "exact":
            return Q(value_text__iexact=str(value))
        if op == "in":
            values = self._ensure_list(value)
            return Q(value_text__in=[str(v) for v in values])
        if op == "contains":
            return Q(value_text__icontains=str(value))
        raise DRFValidationError(
            {"message": f"Operator '{op}' not supported for text fields", "code": "unsupported_operator"}
        )

    def _number_q(self, op: str, value) -> Q:
        if op == "exact":
            return Q(value_number=self._to_decimal(value))
        if op == "in":
            values = self._ensure_list(value)
            return Q(value_number__in=[self._to_decimal(v) for v in values])
        if op == "lt":
            return Q(value_number__lt=self._to_decimal(value))
        if op == "lte":
            return Q(value_number__lte=self._to_decimal(value))
        if op == "gt":
            return Q(value_number__gt=self._to_decimal(value))
        if op == "gte":
            return Q(value_number__gte=self._to_decimal(value))
        if op == "range":
            values = self._ensure_list(value)
            if len(values) != 2:
                raise DRFValidationError(
                    {"message": "Number range filter requires exactly 2 values", "code": "invalid_range"}
                )
            return Q(value_number__range=(self._to_decimal(values[0]), self._to_decimal(values[1])))
        raise DRFValidationError(
            {"message": f"Operator '{op}' not supported for number fields", "code": "unsupported_operator"}
        )

    def _date_q(self, op: str, value) -> Q:
        if op == "exact":
            return Q(value_date=value)
        if op == "lt":
            return Q(value_date__lt=value)
        if op == "lte":
            return Q(value_date__lte=value)
        if op == "gt":
            return Q(value_date__gt=value)
        if op == "gte":
            return Q(value_date__gte=value)
        if op == "range":
            values = self._ensure_list(value)
            if len(values) != 2:
                raise DRFValidationError(
                    {"message": "Date range filter requires exactly 2 values", "code": "invalid_range"}
                )
            return Q(value_date__range=(values[0], values[1]))
        raise DRFValidationError(
            {"message": f"Operator '{op}' not supported for date fields", "code": "unsupported_operator"}
        )

    def _boolean_q(self, op: str, value) -> Q:
        if op != "exact":
            raise DRFValidationError(
                {"message": f"Operator '{op}' not supported for boolean fields", "code": "unsupported_operator"}
            )
        bool_value = self._to_bool(value)
        return Q(value=bool_value)

    def _json_value_q(self, op: str, value, field: TypeExtraField) -> Q:
        """Handle select / user fields stored as JSON."""
        from plane.utils.extra_field_value import _is_multi_selection

        is_multi = _is_multi_selection(field)

        if op == "exact":
            if is_multi:
                return Q(value__contains=[value])
            return Q(value=value)

        if op == "in":
            values = self._ensure_list(value)
            if is_multi:
                q = Q()
                for v in values:
                    q |= Q(value__contains=[v])
                return q
            return Q(value__in=values)

        raise DRFValidationError(
            {"message": f"Operator '{op}' not supported for select/user fields", "code": "unsupported_operator"}
        )

    # ------------------------------------------------------------------ #
    # Value coercion helpers                                               #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _ensure_list(value) -> list:
        if isinstance(value, (list, tuple)):
            return list(value)
        if isinstance(value, str) and "," in value:
            return [v.strip() for v in value.split(",") if v.strip()]
        return [value]

    @staticmethod
    def _to_decimal(value) -> Decimal:
        try:
            return Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            raise DRFValidationError(
                {"message": f"Invalid numeric value: '{value}'", "code": "invalid_number"}
            )

    @staticmethod
    def _to_bool(value) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes"}:
                return True
            if normalized in {"false", "0", "no"}:
                return False
        raise DRFValidationError(
            {"message": f"Invalid boolean value: '{value}'", "code": "invalid_boolean"}
        )
