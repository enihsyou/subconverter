# My Subconverter Profile

可以投喂给 subconverter 的配置文件，用于跑在 RT-AX86U 上的 Merlin Clash。

- 适合中国大陆网络环境，移除了广告拦截、网易音乐，补上大集合漏的部分
- 使用 .env 文件保存订阅链接，整个代码库可公开上传
- 自动发布到私有 Gist 给 Merlin Clash 使用

## 如何生成 Clash 配置文件

这是几个主要步骤

```shell-session
make subconverter.exe
make merlinclash_deduplicated.yaml
make gistconf.ini
make gist
```

## 如何在 Merlin Clash 应用

参考 [Merlin Clash Wiki - 高级订阅方式](https://mcreadme.gitbook.io/mc/base/subscribe#gao-ji-ding-yue-fang-shi) 所述的界面截图，
在 **<ins>远程配置</ins>** 一栏填上 Gist 的 Raw 文件地址，并**<ins>勾选使用</ins>**。

Gist 地址可以由 `make gist` 获取，或者查看你的 `gistconf.ini` 文件。

其他配置我一般这样选

- [ ] emoji
- [x] 启用udp
- [ ] 节点类型
- [ ] 节点排序
- [ ] 过滤非法节点
- [ ] 跳过证书验证
- [x] TCP Fast Open

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

### 上传 Gist

最终的结果，不会自动上传到 Gist，需要从 [gistconf.example.ini](gistconf.example.ini) 复制出`gistconf.ini` 文件，填入你的 Gist token。

注意 gist token 有效期，可在[GitHub Settings](https://github.com/settings/tokens/new?scopes=gist&description=Subconverter)创建

运行 `make gist` 就会自动上传到 Gist，获得一条 URL。
