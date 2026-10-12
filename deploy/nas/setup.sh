#!/usr/bin/env bash
# One-time setup of YODO on the Synology NAS (DSM 7.2, Container Manager).
# Run as root over SSH from the folder it was uploaded to, e.g.
#   bash /volume2/docker/yodo/setup.sh   (or /volume2/... - any volume works)
# Everything lives next to this script.
set -euo pipefail

REPO_PATH="mikestw43/Yodo_school"
BASE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$BASE/app"
KEY="$BASE/.ssh/deploy_key"     # on the data volume, so DSM updates keep it
BRANCH="main"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Run as root: sudo -i first."; exit 1; }
command -v git >/dev/null || { echo "git is missing. Install 'Git Server' from Package Center, then run again."; exit 1; }
command -v docker >/dev/null || { echo "docker is missing. Install 'Container Manager' from Package Center, then run again."; exit 1; }

say "1/4 GitHub deploy key (read-only)"
mkdir -p "$BASE/.ssh" && chmod 700 "$BASE/.ssh"
[ -f "$KEY" ] || ssh-keygen -t ed25519 -N "" -C "yodo-nas" -f "$KEY" >/dev/null
chmod 600 "$KEY"
SSHCMD="ssh -i $KEY -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$BASE/.ssh/known_hosts"
if ! GIT_SSH_COMMAND="$SSHCMD -o BatchMode=yes" git ls-remote "git@github.com:$REPO_PATH.git" >/dev/null 2>&1; then
  echo
  echo "Add this key on GitHub: repo -> Settings -> Deploy keys -> Add deploy key"
  echo "Title: NAS   (leave 'Allow write access' unticked)"
  echo "-------------------------------------------------------------"
  cat "$KEY.pub"
  echo "-------------------------------------------------------------"
  read -rp "Press Enter after you have added it... " _
  GIT_SSH_COMMAND="$SSHCMD -o BatchMode=yes" git ls-remote "git@github.com:$REPO_PATH.git" >/dev/null \
    || { echo "GitHub still refuses the key. Check it was pasted completely, then run again."; exit 1; }
fi

say "2/4 Code -> $APP_DIR"
[ -d "$APP_DIR/.git" ] || GIT_SSH_COMMAND="$SSHCMD" git clone -q -b "$BRANCH" "git@github.com:$REPO_PATH.git" "$APP_DIR"
git -C "$APP_DIR" config core.sshCommand "$SSHCMD"
[ -f "$APP_DIR/.env" ] || cp "$APP_DIR/.env.example" "$APP_DIR/.env"

say "3/4 Build and start"
bash "$APP_DIR/deploy/update.sh" --force

say "4/4 Done"
# The address on the default route (skips unplugged ports with 169.254.x.x).
IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="src"){print $(i+1);exit}}')"
. "$APP_DIR/.env"
echo "Open    : http://${IP:-<NAS-IP>}:${PORT:-8092}"
echo "Version : $(cat "$APP_DIR/web/version.txt")"
echo "Next    : add the Task Scheduler job (see deploy/nas/README.md, step 4)"
