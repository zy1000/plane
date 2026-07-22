# Cursor 多人共享账号的封号风险

核验日期：2026-07-22

## 结论

**多个用户同时登录并使用同一个 Cursor 账号，确实可能导致账号被标记、限制，乃至被完整封禁。** Cursor 没有公开“几个人、几个 IP 或多长时间必封”的阈值，也没有公布封禁率，因此不能说一定会封；但这不是安全或受支持的使用方式，尤其不应把个人 Pro、Pro+ 或 Ultra 账号当作多人席位使用。

## 依据与边界

| 场景 | 官方信息 | 风险判断 |
| --- | --- | --- |
| 同一自然人在家用机、公司电脑等多设备间切换，且不并行使用 | Cursor 员工曾说明个人 Pro 可登录约 3 台设备，但用量共享；该设备政策没有写入正式条款，且可能调整。[员工答复](https://forum.cursor.com/t/2nd-computer-on-pro-license/34077/2)、[后续说明](https://forum.cursor.com/t/2nd-computer-on-pro-license/34077/7) | 通常可用，但设备数量不是长期保证。 |
| 同一自然人在多台机器上同时使用 | Cursor 员工称，同时使用可能被系统判为滥用并触发标记；员工也明确说不能保证多设备并行使用。[员工答复](https://forum.cursor.com/t/2nd-computer-on-pro-license/34077/10) | 有被限制的风险，应避免。 |
| 多个自然人共享一个个人账号，无论是否同时使用 | 2026 年 Cursor 员工明确答复：账号共享违反 Cursor 条款，且已有反滥用措施；应让每个人创建自己的账号。[员工答复](https://forum.cursor.com/t/can-multiple-people-use-one-cursor-account/158868/5) | 明确不建议；同时使用会进一步提高被识别为滥用的风险。 |
| 多人同时共享一个账号 | Cursor 员工曾直接警告，多人同时使用可能导致系统完整封锁该账号。[员工答复](https://forum.cursor.com/t/common-use-of-cursor-with-an-e-mail-address/45840/2) | **存在封号可能，风险高。** |
| 受企业 MSA 约束的 Teams / Enterprise 用户 | MSA 明文要求每个 Authorized User 的登录不得由多人共享；用户违反协议或危及服务安全时，Anysphere 可暂停或终止对应用户账号。[MSA 第 4.1、10.2 节](https://cursor.com/terms/msa) | 明文禁止，违规账号可被暂停或终止。 |

个人用户适用的现行《Terms of Service》（2026-01-13 更新）**没有逐字写出**“一个登录不得由多人共享”，文本明确的是不得出借服务、账号密码须保密，以及账号下全部活动由账号持有人负责；Cursor 员工则已将“account sharing”明确解释为违反条款。因此，个人条款在措辞上不如企业 MSA 直白，但官方执行口径并不含糊。[Terms 第 1.5、3 节](https://cursor.com/en-US/terms-of-service)

处罚也不只限于临时登出。现行 Terms 第 9 节允许 Cursor 暂停或终止全部或部分访问；为防止滥用或处理安全问题时可能不预先通知；若因违反条款被终止，未使用的订阅费可不退，并可能删除账号相关内容。误判可通过 `hi@cursor.com` 申诉。[Terms 第 9 节](https://cursor.com/en-US/terms-of-service)

## 实际执行的不确定性

公开的一手资料只确认了“有反滥用检测”和“可能标记、限制或封锁”，没有披露检测信号、处置阶梯、观察窗口或封禁概率。论坛员工答复也说明设备数量政策可能变化。因此，不能把“目前偶尔共享未出事”理解成获准使用，也不能保证首次命中一定是永久封号。

## 建议

多人使用时，每个自然人应使用独立账号；团队协作应按用户购买 Teams / Enterprise 成员席位。Cursor 的现行 Pricing Policy 也将 Individual 和 Teams 的预购用量按“individual user”计算，而不是供多人共用。[Pricing Policy 第 2.3 节](https://cursor.com/terms/pricing) 若只是同一人跨设备工作，尽量错开使用并退出闲置设备，不要让不同地点的多台设备同时持续发起请求。

## 一手来源

- [Cursor Terms of Service（更新于 2026-01-13）](https://cursor.com/en-US/terms-of-service)
- [Cursor Master Services Agreement（更新于 2025-07-17）](https://cursor.com/terms/msa)
- [Cursor Pricing Policy（Individual / Teams 按单个用户计算用量）](https://cursor.com/terms/pricing)
- [Cursor 员工：多人共享违反条款，平台有反滥用措施（2026-04-23）](https://forum.cursor.com/t/can-multiple-people-use-one-cursor-account/158868/5)
- [Cursor 员工：多人同时使用可能完整封锁账号（2025-01-30）](https://forum.cursor.com/t/common-use-of-cursor-with-an-e-mail-address/45840/2)
- [Cursor 员工：同一用户的多设备与并行使用说明（2024-12 至 2025-03）](https://forum.cursor.com/t/2nd-computer-on-pro-license/34077)
- [论坛员工身份：Dan（CursorStaff）](https://forum.cursor.com/u/danperks)、[Kevin（CursorStaff）](https://forum.cursor.com/u/kevinn)
