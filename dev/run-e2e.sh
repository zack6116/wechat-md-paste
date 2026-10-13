#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MATERIALS="${1:-/Users/zack/Downloads/wechat-materials-20261013}"
cd "$ROOT"
echo "== 素材目录解析与配图 =="
node dev/e2e-materials.mjs "$MATERIALS"
echo
echo "== 模拟编辑器写入 =="
node dev/e2e-main-insert.mjs "$MATERIALS"
echo
echo "== 扩展 + 模拟编辑页（会短暂打开 Chromium 窗口） =="
node dev/e2e-extension.mjs "$MATERIALS"
echo "== 扩展 + 模拟贴图编辑页 createType=8 =="
node dev/e2e-extension.mjs "$MATERIALS" --image-post
echo
echo "== 本机 Chrome 检查 =="
if osascript <<'APPLESCRIPT' 2>/dev/null; then
tell application "Google Chrome"
  activate
  repeat with w in windows
    set tabIndex to 0
    repeat with t in tabs of w
      set tabIndex to tabIndex + 1
      if (URL of t as text) contains "appmsg_edit" then
        set active tab index of w to tabIndex
        set index of w to 1
        exit repeat
      end if
    end repeat
  end repeat
end tell
APPLESCRIPT
  echo "已尝试把图文编辑页标签切到 Chrome 前台。"
fi
if osascript -e 'tell application "Google Chrome" to get URL of active tab of front window' 2>/dev/null | grep -q 'mp.weixin.qq.com'; then
  echo "当前前台标签是公众号后台。"
else
  echo "请把图文编辑页切到 Chrome 前台后再导入。"
fi
echo
LOG="$HOME/Downloads/wechat-md-paste-last-import.txt"
echo "手动 E2E：chrome://extensions 重新加载扩展 → 刷新编辑页 → 选择文章目录 → $MATERIALS"
echo "导入结束后检查：$LOG"
if [[ -f "$LOG" ]]; then
  echo
  echo "== 本机真实导入日志（末尾） =="
  tail -8 "$LOG"
  if grep -q "已插入正文" "$LOG" && ! grep -q "找不到正文编辑区" "$LOG" && ! grep -q "编辑器没有响应" "$LOG"; then
    echo "本机导入日志：通过"
  else
    echo "本机导入日志：未通过（见上文）"
  fi
else
  echo
  echo "尚未发现本机导入日志（需在你登录的 Chrome 里完成一次导入）。"
  echo "Agent 验收：终端 A 运行 npm run live:log-server，重新加载扩展后导入，终端 B 运行 npm run live:wait"
fi
