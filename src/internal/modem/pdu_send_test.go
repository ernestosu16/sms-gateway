package modem

import (
	"strings"
	"testing"

	"github.com/warthog618/sms"
	"github.com/warthog618/sms/encoding/pdumode"
	"github.com/warthog618/sms/encoding/tpdu"
)

// decodeParts reads back what encodeSubmitPDUs produced, as the phone would.
func decodeParts(t *testing.T, parts []submitPDU) ([]*tpdu.TPDU, string) {
	t.Helper()
	var tpdus []*tpdu.TPDU
	for _, p := range parts {
		pdu, err := pdumode.UnmarshalHexString(p.hex)
		if err != nil {
			t.Fatalf("unmarshal hex: %v", err)
		}
		if len(pdu.TPDU) != p.length {
			t.Fatalf("AT+CMGS length %d, TPDU is %d octets", p.length, len(pdu.TPDU))
		}
		tp, err := sms.Unmarshal(pdu.TPDU, sms.AsMO)
		if err != nil {
			t.Fatalf("unmarshal TPDU: %v", err)
		}
		tpdus = append(tpdus, tp)
	}
	text, err := sms.Decode(tpdus)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	return tpdus, string(text)
}

func TestEncodeSubmitPDUsShortMessageIsOnePart(t *testing.T) {
	parts, err := encodeSubmitPDUs(sms.NewEncoder(sms.AsSubmit), "+15551234567", "Hola, tu paquete llego.")
	if err != nil {
		t.Fatal(err)
	}
	if len(parts) != 1 {
		t.Fatalf("got %d parts, want 1", len(parts))
	}
	tpdus, text := decodeParts(t, parts)
	if text != "Hola, tu paquete llego." {
		t.Errorf("decoded %q", text)
	}
	if _, _, _, ok := tpdus[0].ConcatInfo(); ok {
		t.Error("a single SMS must not carry a concatenation header")
	}
	if got := tpdus[0].DA.Number(); got != "+15551234567" {
		t.Errorf("destination %q", got)
	}
}

func TestEncodeSubmitPDUsLongMessageIsConcatenated(t *testing.T) {
	body := strings.Repeat("Sigue tus envios en el enlace. ", 10) // 310 chars
	parts, err := encodeSubmitPDUs(sms.NewEncoder(sms.AsSubmit), "+15551234567", body)
	if err != nil {
		t.Fatal(err)
	}
	if len(parts) != 3 {
		t.Fatalf("got %d parts, want 3", len(parts))
	}

	tpdus, text := decodeParts(t, parts)
	if text != body {
		t.Errorf("decoded text differs:\n got %q\nwant %q", text, body)
	}

	_, _, ref, _ := tpdus[0].ConcatInfo()
	for i, tp := range tpdus {
		segments, seq, r, ok := tp.ConcatInfo()
		if !ok || segments != 3 || seq != i+1 || r != ref {
			t.Errorf("part %d: concat info segments=%d seq=%d ref=%d ok=%v", i+1, segments, seq, r, ok)
		}
	}
}

func TestEncodeSubmitPDUsEachLongMessageGetsItsOwnReference(t *testing.T) {
	enc := sms.NewEncoder(sms.AsSubmit)
	body := strings.Repeat("x", 200)

	first, _ := encodeSubmitPDUs(enc, "+15551234567", body)
	second, _ := encodeSubmitPDUs(enc, "+15551234567", body)

	a, _ := decodeParts(t, first)
	b, _ := decodeParts(t, second)
	_, _, refA, _ := a[0].ConcatInfo()
	_, _, refB, _ := b[0].ConcatInfo()
	if refA == refB {
		t.Errorf("both messages use concatenation reference %d", refA)
	}
}

func TestEncodeSubmitPDUsKeepsAccents(t *testing.T) {
	body := "Envío entregado en Habana. Ñandú, ¿sí? 📦"
	parts, err := encodeSubmitPDUs(sms.NewEncoder(sms.AsSubmit), "+15551234567", body)
	if err != nil {
		t.Fatal(err)
	}
	if _, text := decodeParts(t, parts); text != body {
		t.Errorf("decoded %q", text)
	}
}

func TestValidateSMSRejectsOverlongBody(t *testing.T) {
	if err := ValidateSMS("+15551234567", strings.Repeat("a", maxBodyRunes)); err != nil {
		t.Errorf("body at the limit rejected: %v", err)
	}
	if err := ValidateSMS("+15551234567", strings.Repeat("a", maxBodyRunes+1)); err == nil {
		t.Error("body over the limit accepted")
	}
}
