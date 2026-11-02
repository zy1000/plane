# Django imports
from django.db import models


class NetworkZone(models.TextChoices):
    """大网 / 小网归属（见 docs/network-zone/plan.md）。

    大网能连互联网，小网是纯内网。用户首次登录时按来源绑定；文件新建时按上传人归属落值，
    复制时继承源文件；存量文件一律小网。
    """

    WAN = "wan", "大网"
    LAN = "lan", "小网"
