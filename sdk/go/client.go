// Package authfly is the Go server SDK: a client of the Authfly JSON API that implements contract.Provider
// (the Stalwart provider seen from Go). The capability flags come from GET /api/v1/capabilities.
package authfly

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/authfly/authfly/sdk/go/contract"
)

// Error is a contract AuthError with the HTTP status.
type Error struct {
	Status  int
	Code    string `json:"error"`
	Message string `json:"message"`
}

func (e *Error) Error() string {
	return fmt.Sprintf("authfly: %s (%d): %s", e.Code, e.Status, e.Message)
}

// Client calls an Authfly server.
type Client struct {
	URL    string // e.g. https://auth.example.com
	APIKey string // optional X-Authfly-Key
	HTTP   *http.Client
}

var _ contract.Provider = (*Client)(nil)

// New returns a client for the server at url.
func New(url, apiKey string) *Client {
	return &Client{URL: strings.TrimRight(url, "/"), APIKey: apiKey, HTTP: &http.Client{Timeout: 30 * time.Second}}
}

type rawUser struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	Username      string `json:"username"`
	Name          string `json:"name"`
	EmailVerified bool   `json:"email_verified"`
	AMR           string `json:"amr"`
}

func (u rawUser) user() contract.User {
	return contract.User{Id: u.Sub, Email: u.Email, Username: u.Username, Name: u.Name, EmailVerified: u.EmailVerified}
}

func (c *Client) call(ctx context.Context, method, path string, in any, token string, out any) error {
	var body *bytes.Reader
	if in != nil {
		b, _ := json.Marshal(in)
		body = bytes.NewReader(b)
	} else {
		body = bytes.NewReader(nil)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.URL+"/api/v1"+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("X-Authfly-Key", c.APIKey)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		e := &Error{Status: res.StatusCode}
		_ = json.NewDecoder(res.Body).Decode(e)
		if e.Code == "" {
			e.Code = "error"
		}
		return e
	}
	if out != nil {
		return json.NewDecoder(res.Body).Decode(out)
	}
	return nil
}

type sessionResp struct {
	Token string  `json:"token"`
	User  rawUser `json:"user"`
}

func (s sessionResp) session() contract.Session {
	return contract.Session{Token: s.Token, User: s.User.user(), Method: s.User.AMR}
}

func (c *Client) Capabilities(ctx context.Context) (contract.Capabilities, error) {
	var o contract.Capabilities
	return o, c.call(ctx, "GET", "/capabilities", nil, "", &o)
}

func (c *Client) SignIn(ctx context.Context, in contract.SignInInput) (contract.Session, error) {
	var o sessionResp
	err := c.call(ctx, "POST", "/sign-in", in, "", &o)
	return o.session(), err
}

func (c *Client) SignUp(ctx context.Context, in contract.SignUpInput) (contract.User, error) {
	var o struct{ User rawUser }
	err := c.call(ctx, "POST", "/sign-up", in, "", &o)
	return o.User.user(), err
}

func (c *Client) VerifyEmail(ctx context.Context, in contract.TokenInput) (contract.Ok, error) {
	err := c.call(ctx, "POST", "/verify-email", in, "", nil)
	return contract.Ok{Ok: err == nil}, err
}

func (c *Client) SendMagicLink(ctx context.Context, in contract.MagicLinkInput) (contract.Sent, error) {
	var o struct {
		SentTo string `json:"sent_to"`
	}
	err := c.call(ctx, "POST", "/magic-link", map[string]string{"identifier": in.Identifier}, "", &o)
	return contract.Sent{SentTo: o.SentTo}, err
}

func (c *Client) VerifyMagicLink(ctx context.Context, in contract.MagicLinkInput) (contract.Session, error) {
	var o sessionResp
	err := c.call(ctx, "POST", "/magic-link/verify", map[string]string{"token": in.Token}, "", &o)
	return o.session(), err
}

func (c *Client) ResetPassword(ctx context.Context, in contract.ResetPasswordInput) (contract.Ok, error) {
	var err error
	if in.Token != "" {
		err = c.call(ctx, "POST", "/reset", map[string]string{"token": in.Token, "password": in.Password}, "", nil)
	} else {
		err = c.call(ctx, "POST", "/forgot", map[string]string{"email": in.Email}, "", nil)
	}
	return contract.Ok{Ok: err == nil}, err
}

func (c *Client) Session(ctx context.Context, in contract.TokenInput) (contract.Session, error) {
	var o struct{ User rawUser }
	err := c.call(ctx, "GET", "/me", nil, in.Token, &o)
	return contract.Session{Token: in.Token, User: o.User.user()}, err
}

func (c *Client) SignOut(ctx context.Context, in contract.TokenInput) (contract.Ok, error) {
	err := c.call(ctx, "POST", "/me/sign-out-everywhere", map[string]string{}, in.Token, nil)
	return contract.Ok{Ok: err == nil}, err
}

func (c *Client) ExportUser(ctx context.Context, in contract.TokenInput) (contract.Export, error) {
	s, err := c.Session(ctx, in)
	if err != nil {
		return contract.Export{}, err
	}
	var data map[string]any
	err = c.call(ctx, "GET", "/me/export", nil, in.Token, &data)
	return contract.Export{User: s.User, Data: data}, err
}

func (c *Client) DeleteUser(ctx context.Context, in contract.DeleteUserInput) (contract.Ok, error) {
	err := c.call(ctx, "DELETE", "/me", map[string]string{"password": in.Password}, in.Token, nil)
	return contract.Ok{Ok: err == nil}, err
}
