"""第三方系统集成（拉取 / 推送）。

每个集成一个模块：写一个 `IntegrationSpec`，登记到 `registry.INTEGRATIONS`；
地址 / 密钥一律从 settings（env）读，不进代码。
这里不要 import 任何子模块 —— 子模块会 import 模型，包被导入时 Django apps 可能还没 ready。
"""
