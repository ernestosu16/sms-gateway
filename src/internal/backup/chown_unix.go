//go:build unix

package backup

import (
	"os"
	"path/filepath"
	"syscall"
)

// matchParentOwner gives a restored file the owner of its directory when
// running as root, so a service running as its own user (sms-gateway under
// systemd) can still write to it. Best effort: failures are ignored.
func matchParentOwner(path string) {
	if os.Geteuid() != 0 {
		return
	}
	info, err := os.Stat(filepath.Dir(path))
	if err != nil {
		return
	}
	st, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return
	}
	_ = os.Chown(path, int(st.Uid), int(st.Gid))
}
