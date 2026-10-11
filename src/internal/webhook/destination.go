package webhook

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"syscall"
	"time"

	"github.com/mattboston/sms-gateway/internal/apperr"
)

// metadataAddrs are cloud instance-metadata endpoints outside the link-local
// range. They hand out the host's cloud credentials to whoever asks.
var metadataAddrs = []netip.Addr{
	netip.MustParseAddr("100.100.100.200"), // Alibaba Cloud
	netip.MustParseAddr("fd00:ec2::254"),   // AWS IPv6
}

// CheckDestination reports whether webhooks may be delivered to ip.
//
// Link-local addresses (including the 169.254.169.254 cloud metadata
// endpoint), other known metadata endpoints, multicast and unspecified
// addresses are refused, so a webhook URL cannot be used to read cloud
// credentials. Loopback and private LAN addresses stay allowed: a gateway on a
// home or office network commonly notifies services next to it.
func CheckDestination(ip netip.Addr) error {
	ip = ip.Unmap()
	switch {
	case ip.IsLinkLocalUnicast(), ip.IsLinkLocalMulticast(), ip.IsInterfaceLocalMulticast():
		return apperr.New("address_link_local", "link-local address {address} is not allowed", apperr.Params{"address": ip.String()})
	case ip.IsMulticast(), ip.IsUnspecified():
		return apperr.New("address_not_allowed", "address {address} is not allowed", apperr.Params{"address": ip.String()})
	}
	for _, m := range metadataAddrs {
		if ip == m {
			return apperr.New("address_cloud_metadata", "cloud metadata address {address} is not allowed", apperr.Params{"address": ip.String()})
		}
	}
	return nil
}

// newTransport returns an HTTP transport that applies CheckDestination to the
// address actually dialed, after DNS resolution, so a hostname that resolves
// (or later re-resolves) to a refused address is caught too. It ignores proxy
// environment variables, since dialing a proxy would hide the real
// destination from the check.
func newTransport() *http.Transport {
	dialer := &net.Dialer{
		Timeout:   requestTimeout,
		KeepAlive: 30 * time.Second,
		Control: func(_, address string, _ syscall.RawConn) error {
			addrPort, err := netip.ParseAddrPort(address)
			if err != nil {
				return fmt.Errorf("parsing dialed address %q: %w", address, err)
			}
			return CheckDestination(addrPort.Addr())
		},
	}

	t := http.DefaultTransport.(*http.Transport).Clone()
	t.Proxy = nil
	t.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		return dialer.DialContext(ctx, network, addr)
	}
	return t
}
