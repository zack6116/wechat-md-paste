---
name: wechat-mp-markdown
description: >-
  Writes Markdown that the 公众号 MD Paste Chrome extension can import into a
  WeChat Official Account draft. Use when the user asks for 公众号 Markdown,
  图文草稿, MD Paste, 导入公众号, or a .md file meant to be dragged into
  mp.weixin.qq.com.
---

# 公众号可导入 Markdown

生成一份可以直接拖进公众号图文编辑页的 `.md`。扩展只认下面这些语法。不要用 HTML，不要用 Obsidian 双链。

## 最佳实践

图片由扩展自动上传到当前公众号。正文只用 `![说明](images/01.png)` 或公网 `https://` 图片地址，不要让用户先手动传到公众号图床，也不要写 `<img>`。本地图片放在稿子旁边的 `images/` 目录里。

## 输出

只交付 Markdown 正文，外加图片该放哪。文件结构固定为：

```text
文章目录/
  文章.md
  images/
    cover.png
    01.png
```

导入时授权「文章目录」这一层。图片路径相对这个目录来写。

## 稿件骨架

~~~~markdown
---
title: 公众号标题，最多 64 个字
cover: images/cover.png
---

## 第一节

段落之间空一行。

同一段里的换行会变成换行，不会新起一段。

**加粗**、*斜体*、`行内代码`。

- 无序列表
  - 子项前面两个空格
- 第二项

1. 有序列表
2. 第二项

> 引用

[链接文字](https://example.com)

---

![配图说明](images/01.png)

| 左对齐 | 右对齐 |
| :--- | ---: |
| **单元格** | 12 |

```
代码块，没有语法高亮
```
~~~~

`title` 会填进编辑器标题栏。正文不要再写一个同样的一级标题，否则标题会出现两次。正文从 `##` 开始。

`cover` 只做封面，不自动出现在正文里。想在正文里也显示这张图时，再写一次 `![封面](images/cover.png)`。

## 图片

只用这一种：`![说明](路径或网址)`。导入时扩展会自动上传。

| 地址 | 怎么写 |
| --- | --- |
| 本地图 | `images/01.png`，扩展名只能是 png、jpg、jpeg、gif、webp |
| 网络图 | 以 `https://` 开头的公网地址 |
| 已是公众号图床 | `https://mmbiz.qpic.cn/...` 原样保留 |

本地图优先。单张尽量小于 1MB，不要超过 8MB。不要用 SVG、`data:` 长串、`file:`、内网地址或带账号密码的网址。

免费版每篇最多 3 张，且不能读本地文件夹。试用和 Pro 可以读文件夹，张数不限。用户没说明版本时，按本地相对路径来写，并在文末用一行列出需要准备的图片文件名。

## 不要写

这些导入后会变成纯文本，或直接被跳过：

- HTML 标签，包括 `<img>`、`<table>`、`<br>`
- `![[图片.png]]`、`[[链接]]`
- 参考式图片和链接：`![说明][id]`、`[文字][id]`
- 脚注、公式、任务列表 `- [ ]`、Mermaid
- 自动链接 `<https://...>`
- 跨行的 `**加粗**`。加粗、斜体、行内代码都写在同一行
- 不是 `http`、`https`、`mailto` 的链接

表格必须有表头和分隔行，行首行尾都要有 `|`。单元格里可以用加粗、代码和 `https` 链接。
