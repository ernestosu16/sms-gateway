// Package buildinfo identifies the running build, so an operator can tell
// whether a deployment picked up the latest code.
package buildinfo

import (
	"runtime/debug"
	"strings"
)

// Version is the release tag, set at build time with
// -ldflags "-X github.com/mattboston/sms-gateway/internal/buildinfo.Version=...".
var Version = "dev"

// Commit is the source revision. It may be set with -ldflags like Version;
// otherwise it is read from the VCS stamp Go embeds when building inside a git
// checkout. Builds without either (e.g. a Docker context without .git) leave it empty.
var Commit = ""

// shortLen matches the abbreviated hash git prints by default.
const shortLen = 7

func init() {
	if Commit == "" {
		Commit = vcsRevision()
	} else {
		Commit = short(Commit)
	}
}

func short(rev string) string {
	if len(rev) > shortLen {
		return rev[:shortLen]
	}
	return rev
}

func vcsRevision() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return ""
	}
	var revision string
	var modified bool
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			revision = s.Value
		case "vcs.modified":
			modified = s.Value == "true"
		}
	}
	if revision == "" {
		return ""
	}
	if modified {
		return short(revision) + "-dirty"
	}
	return short(revision)
}

// String renders the build as "version (commit)", or just the version when the
// commit is unknown or the version already names it (git describe output).
func String() string {
	if Commit == "" || strings.Contains(Version, strings.TrimSuffix(Commit, "-dirty")) {
		return Version
	}
	return Version + " (" + Commit + ")"
}
