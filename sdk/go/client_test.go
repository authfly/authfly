package authfly

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/authfly/authfly/sdk/go/contract"
)

func TestClient(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case "GET /api/v1/capabilities":
			w.Write([]byte(`{"magicLink":true,"password":false,"social":false,"twoFactor":false,"webauthn":false}`))
		case "POST /api/v1/sign-in":
			var in map[string]string
			json.NewDecoder(r.Body).Decode(&in)
			if in["password"] != "pw" {
				w.WriteHeader(401)
				w.Write([]byte(`{"error":"invalid_credentials","message":"no"}`))
				return
			}
			w.Write([]byte(`{"token":"t1","user":{"sub":"s","email":"a@x.test","name":"A","email_verified":true,"amr":"password"}}`))
		case "GET /api/v1/me":
			if r.Header.Get("Authorization") != "Bearer t1" || r.Header.Get("X-Authfly-Key") != "k" {
				w.WriteHeader(401)
				w.Write([]byte(`{"error":"unauthenticated"}`))
				return
			}
			w.Write([]byte(`{"user":{"sub":"s","email":"a@x.test","name":"A","email_verified":true}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	c, ctx := New(srv.URL, "k"), context.Background()
	caps, err := c.Capabilities(ctx)
	if err != nil || !caps.MagicLink || caps.Password {
		t.Fatal(caps, err)
	}
	s, err := c.SignIn(ctx, contract.SignInInput{Identifier: "a", Password: "pw"})
	if err != nil || s.Token != "t1" || s.User.Id != "s" || s.Method != "password" {
		t.Fatal(s, err)
	}
	var e *Error
	if _, err := c.SignIn(ctx, contract.SignInInput{Identifier: "a", Password: "bad"}); !errors.As(err, &e) || e.Code != "invalid_credentials" || e.Status != 401 {
		t.Fatal(err)
	}
	if me, err := c.Session(ctx, contract.TokenInput{Token: "t1"}); err != nil || me.User.Email != "a@x.test" {
		t.Fatal(me, err)
	}
	if _, err := c.Session(ctx, contract.TokenInput{Token: "bad"}); !errors.As(err, &e) || e.Code != "unauthenticated" {
		t.Fatal(err)
	}
}
