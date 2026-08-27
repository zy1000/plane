from plane.app.permissions import ROLE
from plane.app.permissions.base import _is_instance_admin, is_workspace_member
from plane.db.models import WorkspaceMember
from plane.db.models.product import ProductMember


def can_create_product(user, workspace) -> bool:
    if workspace.owner_id == user.id or _is_instance_admin(user):
        return True
    return WorkspaceMember.objects.filter(
        workspace=workspace,
        member=user,
        role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
        is_active=True,
        deleted_at__isnull=True,
    ).exists()


def can_manage_workspace_products(user, workspace) -> bool:
    if workspace.owner_id == user.id or _is_instance_admin(user):
        return True
    return WorkspaceMember.objects.filter(
        workspace=workspace,
        member=user,
        role=ROLE.ADMIN.value,
        is_active=True,
        deleted_at__isnull=True,
    ).exists()


def can_manage_product(user, product) -> bool:
    if product.owner_id == user.id:
        return True
    return can_manage_workspace_products(user, product.workspace)


def can_view_product(user, product) -> bool:
    if can_manage_product(user, product):
        return True
    if not is_workspace_member(user, product.workspace.slug):
        return False
    if product.network == 2:
        return True
    if product.reviewers.filter(id=user.id).exists():
        return True
    return ProductMember.objects.filter(product=product, member=user).exists()


def can_edit_product_requirements(user, product) -> bool:
    """Product members maintain requirements; product/workspace owners retain access."""
    if can_manage_product(user, product):
        return True
    return ProductMember.objects.filter(product=product, member=user).exists()
