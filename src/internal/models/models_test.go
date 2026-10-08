package models

import "testing"

func TestNormalizePhone(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"+15551234567", "+15551234567"},
		{"555-123-4567", "5551234567"},
		{"(555) 123-4567", "5551234567"},
		{" +1 555.123.4567 ", "+15551234567"},
		{"BANK", "BANK"},
		{"", ""},
	}
	for _, tt := range tests {
		if got := NormalizePhone(tt.in); got != tt.want {
			t.Errorf("NormalizePhone(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
