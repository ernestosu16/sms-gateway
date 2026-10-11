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

func TestSendCountryPolicyCheckDestination(t *testing.T) {
	selected := SendCountryPolicy{Mode: SendCountriesSelected, Countries: []string{"CA", "US"}}
	tests := []struct {
		name    string
		policy  SendCountryPolicy
		phone   string
		allowed bool
	}{
		{"all allows any country", SendCountryPolicy{Mode: SendCountriesAll}, "+34612345678", true},
		{"all allows local numbers", SendCountryPolicy{Mode: SendCountriesAll}, "5551234567", true},
		{"none blocks everything", SendCountryPolicy{Mode: SendCountriesNone}, "+14155552671", false},
		{"selected allows listed country", selected, "+14155552671", true},
		{"selected tells +1 countries apart", selected, "+16135550123", true},
		{"selected blocks other countries", selected, "+34612345678", false},
		{"selected blocks unlisted +1 country", selected, "+17875550123", false},
		{"selected blocks numbers without country code", selected, "4155552671", false},
		{"selected blocks short codes", selected, "12345", false},
		{"unknown mode blocks", SendCountryPolicy{Mode: "bogus"}, "+14155552671", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.policy.CheckDestination(tt.phone)
			if (err == nil) != tt.allowed {
				t.Errorf("CheckDestination(%q) error = %v, want allowed %v", tt.phone, err, tt.allowed)
			}
		})
	}
}
