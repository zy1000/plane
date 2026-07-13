from django.db.models import Q

from plane.db.models import Product, ProductMember, WorkspaceMember

from .base import ROLE


def get_product_workspace_member(user, workspace_slug):
    if not user or user.is_anonymous:
        return None
    return WorkspaceMember.objects.filter(
        member=user,
        workspace__slug=workspace_slug,
        is_active=True,
    ).first()


def filter_products_for_user(queryset, user, workspace_slug):
    workspace_member = get_product_workspace_member(user, workspace_slug)
    if workspace_member is None:
        return queryset.none()

    if workspace_member.role == ROLE.ADMIN.value:
        return queryset

    product_ids = ProductMember.objects.filter(member=user).values_list("product_id", flat=True)
    own_products = Q(owner=user) | Q(created_by=user) | Q(id__in=product_ids)

    if workspace_member.role == ROLE.MEMBER.value:
        return queryset.filter(Q(network=2) | own_products).distinct()

    return queryset.filter(own_products).distinct()


def can_create_product(user, workspace_slug):
    workspace_member = get_product_workspace_member(user, workspace_slug)
    return bool(
        workspace_member
        and workspace_member.role in [ROLE.ADMIN.value, ROLE.MEMBER.value]
    )


def can_manage_product(user, product):
    workspace_member = get_product_workspace_member(user, product.workspace.slug)
    if workspace_member is None:
        return False
    return bool(
        workspace_member.role == ROLE.ADMIN.value
        or product.owner_id == user.id
        or product.created_by_id == user.id
    )


def can_view_product(user, product):
    return filter_products_for_user(
        Product.objects.filter(pk=product.pk),
        user,
        product.workspace.slug,
    ).exists()
