"""统一通知入口。业务代码只用 ``emit``：

    from plane.utils.notify import emit
    emit("release.overdue", "release", release.id, actor_id=None, summary="研发延期")

规则见 ``rules.py``，对象上的收件角色见 ``entities.py``，发信见 ``mailer.py`` / ``digest.py``。
"""

from .emit import emit

__all__ = ["emit"]
