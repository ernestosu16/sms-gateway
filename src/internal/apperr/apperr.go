// Package apperr defines errors that API clients can show in their own
// language. Each carries a stable Code naming the message and the Params that
// fill its {placeholders}, alongside the English text.
package apperr

import (
	"fmt"
	"regexp"
)

// Params fills the {name} placeholders of a message. A value may itself be an
// *Error, which clients translate before inserting it.
type Params map[string]any

// Error is a failure reported to API clients. It marshals to the same shape as
// an error response body, so it can also be nested inside Params.
type Error struct {
	Code    string `json:"code"`
	Message string `json:"error"`
	Params  Params `json:"params,omitempty"`
}

var placeholder = regexp.MustCompile(`\{(\w+)\}`)

// New returns an Error whose English message is template with each {name}
// replaced by params[name].
func New(code, template string, params Params) *Error {
	message := placeholder.ReplaceAllStringFunc(template, func(match string) string {
		value, ok := params[match[1:len(match)-1]]
		if !ok {
			return match
		}
		return fmt.Sprint(value)
	})
	return &Error{Code: code, Message: message, Params: params}
}

func (e *Error) Error() string { return e.Message }
