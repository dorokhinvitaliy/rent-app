#!/bin/sh
set -eu
export DISPLAY=:99
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp &
xpid=$!
# VNC is disabled by default and never published publicly by Compose.
if [ "${ENABLE_VNC:-0}" = 1 ]; then
  if [ ! -s /data/vnc-password ]; then echo 'Create /data/vnc-password with x11vnc -storepasswd first' >&2; exit 1; fi
  x11vnc -display :99 -rfbauth /data/vnc-password -forever -shared -rfbport 5900 -quiet &
fi
node apps/api/dist/main.js &
app=$!
trap 'kill -TERM "$app" "$xpid" 2>/dev/null || true; wait "$app" || true' TERM INT
wait "$app"
