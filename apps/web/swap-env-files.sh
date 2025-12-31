#!/bin/sh
set -eu

FILE1="${1:-/data/code/test2/plane/apps/web/.env}"
FILE2="${2:-/data/code/test2/plane/apps/web/.env.bak}"

if [ ! -e "$FILE1" ]; then
  echo "文件不存在：$FILE1" >&2
  exit 1
fi

if [ ! -e "$FILE2" ]; then
  echo "文件不存在：$FILE2" >&2
  exit 1
fi

TMP="${FILE1}.swap_tmp_$$"
if [ -e "$TMP" ]; then
  echo "临时文件已存在：$TMP" >&2
  exit 1
fi

mv "$FILE1" "$TMP"
mv "$FILE2" "$FILE1"
mv "$TMP" "$FILE2"

echo "已互换："
echo "  $FILE1"
echo "  $FILE2"
