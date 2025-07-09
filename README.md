# My Subconverter Profile

[![Deploy to Gist](https://github.com/enihsyou/subconverter/actions/workflows/deploy-gist.yml/badge.svg)](https://github.com/enihsyou/subconverter/actions/workflows/deploy-gist.yml)

可以投喂给 subconverter 的配置文件，用于跑在 Merlin Clash 上。

- 适合中国大陆网络环境，补上大集合漏的部分
- 适合低功耗设备，移除了广告拦截等巨大规则集
- 使用 .env 文件传递订阅链接，整个代码库可公开上传
- 自动发布到私有 Gist 给 Merlin Clash 使用
- 半自动触发 Merlin Clash 的更新订阅动作

## 为什么有这个项目

目前 Merlin Clash 有非常方便的图形界面设置 [自定规则](https://mcreadme.gitbook.io/mc/advanced/custom)，
但是实现上它是把每条规则一点点 `sed` 合并进 clash 配置文件里的，在 RT-AX86U 上添加 15 条规则花费 30s。

因为不能动态添加规则，有时遇到无法访问的网站我会手动添加一些，再等待系统花费 60s+ 重启。
这速度肯定能提升，把自定义规则提前写到配置文件里就好了，所以有了本项目。

从大的规则仓库里挑拣日常需要用到的规则，并使用 subconverter 转换为 Merlin Clash 的配置文件。

## 如何生成 Clash 配置文件

在 Windows 本地运行这是几个主要步骤

```shell-session
make subconverter.exe              # 拉取最新的 subconverter
make merlinclash_deduplicated.yaml # 生成去重的配置文件
node scripts/apply_merlinclash.js  # 在路由器上应用
```

更多地是使用 [GitHub Actions](.github/workflows/deploy-gist.yml) 在 Linux 环境自动构建。

GitHub Actions 需要配置几个机密变量

- `GIST_ID` 上传目标的 Gist ID，需要提前存在
- `GIST_TOKEN` 上传用的 Gist token，可在[GitHub Settings](https://github.com/settings/tokens/new?scopes=gist&description=Subconverter)创建
- `SUBSCRIPTION_URL` 机场订阅链接

重新运行 GitHub Action 生成 Gist 可更新订阅源。

## 如何在 Merlin Clash 应用

### 方式一 只使用规则

参考 [Merlin Clash Wiki - 高级订阅方式](https://mcreadme.gitbook.io/mc/base/subscribe#gao-ji-ding-yue-fang-shi) 所述的界面截图，
在 **<ins>远程配置</ins>** 一栏填上 [subconverter-config.ini](subconverter-config.ini) 的 Raw 文件地址，并 **<ins>勾选使用</ins>**。

```plaintext
https://github.com/enihsyou/subconverter/tree/main/subconverter-config.ini
```

其他配置我一般这样选

- [ ] emoji
- [x] 启用udp
- [ ] 节点类型
- [ ] 节点排序
- [ ] 过滤非法节点
- [ ] 跳过证书验证
- [x] TCP Fast Open

### 方式二 使用包含节点的订阅

> 我当前使用的，也是建议的方式

同样参考界面截图，在 **<ins>Clash订阅下载</ins>** 一栏填上 Gist 的 Raw 文件地址，再点击 **<ins>Clash订阅</ins>**。

Gist 的地址应该是已知的（`GIST_TOKEN` 环境变量）。因为 Gist 内容带有订阅链接所以不能在这里贴出来。

如果有鸡生蛋蛋生鸡的网络问题，手动下载订阅文件并使用 **导入Clash配置文件** 功能吧😅

不过当你在 Gist 上点击 `Raw` 按钮获取文件 URL 时，它返回的是当前这个 revision 的永久链接，
而这里需要的应该是 latest 版本，好在 [StackOverflow](https://stackoverflow.com/a/47175630/5277711) 给出了方法，
把 `[gist commit ID]` 部分删掉即可。

## 本仓库都做了什么

### 依赖更新

内建了 `make subconverter.exe` 用以拉取最新的 release。但也可以手动切换到 nightly 版。

访问 <https://github.com/tindy2013/subconverter/actions/workflows/build.yml> 寻找最新的构建，
定位到 `Windows amd64 build` 任务，点击 `Upload` 步骤中的 `Artifact download URL` 进行下载

### 获取订阅

在 `make merlinclash.yaml` 生成指令调用的 [generate.ini](generate.ini) 中，引用了写在 [subconverter-profile.ini](subconverter-profile.ini) 的一组档案。

但档案里的 `url` 并没有真实的订阅链接，而是一条利用 subconverter [动态特性]的 `script:`，在运行时会调用 [subscription-secret.js](subscription-secret.js) 脚本（注意这个特性存在[RCE风险]）。

脚本转而加载记载有订阅链接的 `.subconverter_env` 文件，完成机密读取。

[动态特性]: https://github.com/tindy2013/subconverter/blob/92f66bf5b58be5b3e605bb481db5f5ffd6b2aa78/src/generator/config/nodemanip.cpp#L56
[RCE风险]: https://rce.moe/2022/08/23/WMCTF-2022-WRITEUP#RCE

### 规则去重

虽然即便规则有重复，clash 本来就会按先来后到顺序选第一个，
但是重复内容多了也占文件空间不是。

为了让生成的配置清爽一些，编写了 [deduplicate_rules.py](scripts/deduplicate_rules.py) 去除重复的规则条目，只保留第一个条目。

使用 `make merlinclash_deduplicated.yaml` 就能运行它。

### 手动触发

Merlin Clash 带有自动触发更新订阅的功能，但快速迭代期间除了在本地使用订阅，想要在路由器上快速生效每次都得在页面上手动点更新有些麻烦。
所以有了 [apply_merlinclash.js](scripts/apply_merlinclash.js) 脚本，可以自动触发更新订阅动作。

它有两个默认值，分别是配置名和路由器地址，但可以通过命令行参数覆盖。

## 引用致谢

感谢这些仓库贡献者提供的代码和思路，也推荐使用者了解这些仓库提供的规则以供未来扩展。

- [ACL4SSR/ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) 提供大量规则
- [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script) 及时地更新最新规则
- [tindy2013/subconverter](https://github.com/tindy2013/subconverter) 提供转换能力
- [撸猫云魔法 MerlinClash](https://t.me/s/merlinclashcat) 路由器上好用的 Clash 应用
- [limbopro/Profiles4limbo](https://github.com/limbopro/Profiles4limbo) 类似本仓库所做的事，但更面向大众
