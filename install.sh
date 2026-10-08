#!/usr/bin/env bash
set -euo pipefail

DEBUG="${DEBUG:-0}"

REPO="ernestosu16/sms-gateway"
INSTALL_DIR="/opt/sms-gateway"
SERVICE_USER="sms-gateway"
REGISTRY="ghcr.io"

# --- Helpers ---

info()  { printf '\033[1;34m::\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m::\033[0m %s\n' "$*"; }
error() { printf '\033[1;31m::\033[0m %s\n' "$*" >&2; }
fatal() { error "$@"; exit 1; }

usage() {
  cat <<'EOF'
Usage: install.sh [--debug]

Options:
  -d, --debug  Enable verbose debug output (set -x)
  -h, --help   Show this help message
EOF
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -d|--debug)
        DEBUG=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fatal "Unknown option: $1"
        ;;
    esac
    shift
  done

  if [ "$DEBUG" = "1" ]; then
    info "Debug mode enabled"
    set -x
  fi
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fatal "Required command not found: $1"
}

need_root() {
  [ "$(id -u)" -eq 0 ] || fatal "This script must be run as root (use sudo)"
}

# Read a value into the variable named by $1, falling back to $3.
#
# When the script is piped into bash (curl ... | sudo bash) stdin is the script
# text, not the keyboard, so read would consume the script or hit EOF. Read from
# the controlling terminal instead whenever stdin is not a terminal, and fall
# back to defaults when there is no terminal at all (cron, cloud-init, Docker
# build) rather than failing or blocking.
prompt() {
  local var="$1" msg="$2" default="$3" input=""

  if [ -t 0 ]; then
    printf '%s [%s]: ' "$msg" "$default"
    read -r input || input=""
  elif ( : </dev/tty ) 2>/dev/null; then
    printf '%s [%s]: ' "$msg" "$default" >/dev/tty
    read -r input </dev/tty || input=""
  else
    warn "No terminal available; using default for '${msg}': ${default:-<empty>}"
  fi

  printf -v "$var" '%s' "${input:-$default}"
}

# --- Detect platform ---

# Print the operating system name from /etc/os-release, for diagnostics.
detect_os() {
  local name=""
  if [ -r /etc/os-release ]; then
    name="$(. /etc/os-release && printf '%s' "${PRETTY_NAME:-${NAME:-}}")"
  fi
  printf '%s (kernel %s)' "${name:-unknown Linux}" "$(uname -r)"
}

# Print 32 or 64: the word size of the userland, which can differ from the
# kernel. Raspberry Pi OS 32-bit boots a 64-bit kernel on a Pi 3 or newer, so
# uname -m says aarch64 while every program on the system is 32-bit.
userland_bits() {
  local bits=""
  bits="$(getconf LONG_BIT 2>/dev/null || true)"
  if [ "$bits" != "32" ] && [ "$bits" != "64" ]; then
    # EI_CLASS, the fifth byte of an ELF header: 1 = 32-bit, 2 = 64-bit.
    case "$(od -An -tu1 -j4 -N1 /bin/sh 2>/dev/null | tr -d ' ')" in
      1) bits=32 ;;
      2) bits=64 ;;
    esac
  fi
  printf '%s' "$bits"
}

# Print the release asset suffix that runs on this machine.
detect_arch() {
  local machine bits
  machine="$(uname -m)"
  bits="$(userland_bits)"

  [ "$(uname -s)" = "Linux" ] || fatal "Unsupported operating system: $(uname -s) (only Linux is supported)"

  case "$machine" in
    x86_64|amd64)
      [ "$bits" = "32" ] && fatal "Unsupported platform: 32-bit userland on $machine"
      echo "linux-amd64"
      ;;
    aarch64|arm64|armv8*)
      if [ "$bits" = "32" ] || [ "$machine" = "armv8l" ]; then
        echo "linux-arm7"
      else
        echo "linux-arm64"
      fi
      ;;
    armv7*)  echo "linux-arm7" ;;
    armv6*)  echo "linux-arm6" ;;
    *)       fatal "Unsupported architecture: $machine (userland ${bits:-unknown}-bit)" ;;
  esac
}

# --- Fetch latest release tag ---

get_latest_version() {
  local url="https://api.github.com/repos/${REPO}/releases/latest" body
  if ! body="$(curl -fsSL "$url")"; then
    error "Could not reach $url"
    error "Check the network, DNS, and the system clock (date: $(date)); a wrong clock breaks TLS"
    return 1
  fi
  printf '%s\n' "$body" | sed -n -E 's/.*"tag_name": *"([^"]+)".*/\1/p' | head -n 1
}

# Download the release binary for $arch to $dest, verify it against the
# release checksums, and check that it runs on this machine.
download_binary() {
  local version="$1" arch="$2" dest="$3"
  local base="https://github.com/${REPO}/releases/download/${version}"
  local name="sms-gateway-${arch}" tmp

  tmp="$(mktemp "${dest}.XXXXXX")"
  trap "rm -f '$tmp'" EXIT

  info "Downloading sms-gateway ${version} (${arch})..."
  curl -fsSL -o "$tmp" "${base}/${name}" \
    || fatal "Download failed: ${base}/${name} (release ${version} may not include ${arch})"

  if command -v sha256sum >/dev/null 2>&1; then
    local expected actual
    expected="$(curl -fsSL "${base}/checksums.txt" | awk -v n="$name" '$2 == n { print $1 }')" || expected=""
    if [ -n "$expected" ]; then
      actual="$(sha256sum "$tmp" | awk '{ print $1 }')"
      [ "$expected" = "$actual" ] || fatal "Checksum mismatch for $name (expected $expected, got $actual)"
      info "Checksum verified"
    else
      warn "No checksum published for $name; skipping verification"
    fi
  else
    warn "sha256sum not found; skipping checksum verification"
  fi

  chmod 755 "$tmp"
  local out
  if ! out="$("$tmp" --version 2>&1)"; then
    fatal "Downloaded binary does not run on this machine ($(uname -m), userland $(userland_bits)-bit): $out"
  fi
  info "Binary check: $out"

  # Rename instead of overwriting in place: writing over a binary that the
  # running service is executing fails with "Text file busy".
  mv -f "$tmp" "$dest"
  trap - EXIT
}

# List serial devices a USB modem usually shows up as.
list_serial_devices() {
  local d
  for d in /dev/ttyUSB* /dev/ttyACM*; do
    [ -e "$d" ] && printf '%s ' "$d"
  done
}

# --- Systemd install ---

install_systemd() {
  need_root
  local cmd
  for cmd in curl systemctl useradd usermod getent mktemp od; do
    need_cmd "$cmd"
  done
  [ -d /run/systemd/system ] || fatal "systemd is not running on this system; use the Docker install instead"

  local arch version mode

  mode="install"
  if [ -f "${INSTALL_DIR}/sms-gateway" ] || [ -f /etc/systemd/system/sms-gateway.service ]; then
    mode="upgrade"
  fi
  info "Mode: ${mode}"

  info "Detected OS: $(detect_os)"
  arch="$(detect_arch)"
  info "Detected platform: $(uname -m), userland $(userland_bits)-bit, using ${arch}"

  info "Fetching latest release..."
  version="$(get_latest_version)" || fatal "Could not determine latest version"
  [ -n "$version" ] || fatal "Could not determine latest version"
  info "Latest version: $version"

  # Configuration values used only when creating a new config file.
  local device_path="/dev/ttyUSB2" jwt_secret="" host="127.0.0.1" port="5174"
  if [ "$mode" = "install" ]; then
    local devices
    devices="$(list_serial_devices)"
    if [ -n "$devices" ]; then
      info "Serial devices found: ${devices}"
      case " $devices" in
        *" $device_path "*) ;;
        *) device_path="${devices%% *}" ;;
      esac
    else
      warn "No /dev/ttyUSB* or /dev/ttyACM* device found; is the modem plugged in?"
    fi
    prompt device_path "Serial device path" "$device_path"
    prompt host "HTTP listen address (0.0.0.0 to allow other machines)" "$host"
    prompt port "HTTP port" "$port"
    prompt jwt_secret "JWT secret (leave blank to auto-generate)" ""
  else
    info "Upgrade mode: skipping config prompts"
  fi

  # sms-gateway refuses to start with a shorter secret.
  if [ -n "$jwt_secret" ] && [ "${#jwt_secret}" -lt 32 ]; then
    fatal "JWT secret must be at least 32 characters (leave blank to auto-generate)"
  fi
  if [ -z "$jwt_secret" ]; then
    if command -v openssl >/dev/null 2>&1; then
      jwt_secret="$(openssl rand -base64 32)"
    else
      jwt_secret="$(head -c 32 /dev/urandom | base64)"
    fi
    if [ "$mode" = "install" ]; then
      info "Generated JWT secret"
    fi
  fi

  # Create service user
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    info "Creating service user: $SERVICE_USER"
    useradd -r -s /usr/sbin/nologin "$SERVICE_USER"
  else
    info "Service user already exists, skipping: $SERVICE_USER"
  fi

  # Add to dialout group for modem access
  if getent group dialout >/dev/null 2>&1; then
    if id -nG "$SERVICE_USER" | grep -qw dialout; then
      info "$SERVICE_USER is already in dialout group, skipping"
    else
      usermod -aG dialout "$SERVICE_USER"
      info "Added $SERVICE_USER to dialout group"
    fi
  fi

  # Create install directory
  if [ -d "$INSTALL_DIR" ]; then
    info "Install directory already exists, reusing: $INSTALL_DIR"
  else
    info "Creating install directory: $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
  fi

  # Download binary
  if [ -f "${INSTALL_DIR}/sms-gateway" ]; then
    info "Replacing existing binary"
  fi
  download_binary "$version" "$arch" "${INSTALL_DIR}/sms-gateway"

  # Write config file (don't overwrite existing)
  local config_file="${INSTALL_DIR}/sms-gateway.conf"
  if [ -f "$config_file" ]; then
    info "Config file already exists, preserving: $config_file"
    local existing_secret
    existing_secret="$(sed -n 's/^JWT_SECRET=//p' "$config_file" | tail -n 1)"
    if [ "${#existing_secret}" -lt 32 ]; then
      warn "JWT_SECRET in $config_file is shorter than 32 characters; sms-gateway will not start until you replace it (e.g. openssl rand -base64 32)"
    fi
    if ! grep -q '^HOST=' "$config_file"; then
      warn "No HOST in $config_file; sms-gateway now listens on 127.0.0.1 only. Add HOST=0.0.0.0 to keep accepting connections from other machines"
    fi
  else
    if [ "$mode" = "upgrade" ]; then
      warn "Config file missing during upgrade; creating default config: $config_file"
    fi
    cat > "$config_file" <<EOF
DB_DRIVER=sqlite
DB_DSN=${INSTALL_DIR}/sms-gateway.db
DEVICE_PATH=${device_path}
BAUD_RATE=9600
HOST=${host}
PORT=${port}
JWT_SECRET=${jwt_secret}
EOF
    chmod 600 "$config_file"
    info "Wrote configuration to $config_file"
  fi

  # Set ownership
  chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

  # Install systemd unit
  cat > /etc/systemd/system/sms-gateway.service <<EOF
[Unit]
Description=SMS Gateway
Documentation=https://github.com/${REPO}
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/sms-gateway serve --config-file ${INSTALL_DIR}/sms-gateway.conf
Restart=on-failure
RestartSec=5

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${INSTALL_DIR}
PrivateTmp=true

SupplementaryGroups=dialout

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable sms-gateway
  if [ "$mode" = "upgrade" ]; then
    systemctl restart sms-gateway
  else
    systemctl start sms-gateway
  fi

  # A crashing service still reports active right after start, so give it a
  # moment before checking.
  sleep 3
  local service_state service_enabled
  service_state="$(systemctl is-active sms-gateway 2>/dev/null || true)"
  service_enabled="$(systemctl is-enabled sms-gateway 2>/dev/null || true)"

  if [ "$service_state" != "active" ]; then
    error "sms-gateway is not running (status: ${service_state:-unknown}). Recent logs:"
    journalctl -u sms-gateway -n 30 --no-pager >&2 || true
    fatal "Fix the problem above, then run: sudo systemctl restart sms-gateway"
  fi

  info "Installation complete!"
  info ""
  info "  Binary:  ${INSTALL_DIR}/sms-gateway"
  info "  Config:  ${INSTALL_DIR}/sms-gateway.conf"
  info "  Service: sms-gateway.service"
  info "  Status:  ${service_state:-unknown} (enabled: ${service_enabled:-unknown})"
  info ""
  info "Start with: sudo systemctl start sms-gateway"
  info "Logs:       sudo journalctl -u sms-gateway -f"
}

# --- Docker install ---

install_docker() {
  info "Docker installation coming soon!"
}

# --- Main ---

main() {
  parse_args "$@"

  echo ""
  echo "  SMS Gateway Installer"
  echo "  ====================="
  echo ""
  echo "  1) Systemd  - Install as a native Linux service"
  echo "  2) Docker   - Run as a Docker container"
  echo ""

  local choice
  prompt choice "Install method" "1"

  case "$choice" in
    1|systemd)  install_systemd ;;
    2|docker)   install_docker ;;
    *)          fatal "Invalid choice: $choice" ;;
  esac
}

main "$@"
