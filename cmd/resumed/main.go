// Command resumed serves the résumé builder: a drag-and-drop editor over the
// block store with a live LaTeX preview.
//
// Deployment shape. The container holds no durable state. The block store and
// the résumé manifests are files in a git repository, so a save writes YAML,
// commits, and pushes; the next process to start clones them back. That is what
// makes the service safe to run on ephemeral scheduling, and it means every
// content edit lands as a reviewable diff rather than as an opaque mutation.
//
// The tectonic support-file cache is baked into the image at build time. A cold
// cache costs minutes of downloads, which an ephemeral allocation would pay on
// every restart.
package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/blackdragoon26/muchBetterPortfolio/internal/block"
	"github.com/blackdragoon26/muchBetterPortfolio/internal/compile"
	"github.com/blackdragoon26/muchBetterPortfolio/internal/manifest"
	"github.com/blackdragoon26/muchBetterPortfolio/internal/passkey"
	"github.com/blackdragoon26/muchBetterPortfolio/internal/persist"
	"github.com/blackdragoon26/muchBetterPortfolio/internal/render"
	"github.com/blackdragoon26/muchBetterPortfolio/internal/totp"
)

//go:embed ui/*
var uiFiles embed.FS

const (
	sessionCookie = "resumekit_session"

	// A résumé manifest is a few kilobytes. The cap is generous for that and
	// still refuses anything that could be used to exhaust memory.
	maxRequestBytes = 1 << 20

	// One tectonic run at a time. It is CPU-bound and the node is shared with
	// other applications, so extra previews are refused rather than queued.
	maxConcurrentCompiles = 1

	compileTimeout = 60 * time.Second

	// Only the most recent previews are retained; each PDF is roughly 50 KB.
	maxCachedPDFs = 24
)

type server struct {
	repoRoot    string
	blocksRoot  string
	resumesRoot string

	// secret backs the browser login. token is optional and exists only so
	// scripts and curl can reach the API without a one-time code.
	secret totp.Secret
	guard  *totp.Guard
	token  string
	git    *persist.Git

	// passkeys is an alternative to the one-time code, not an addition to it.
	// Requiring both would mean a lost laptop locks the account out; offering
	// either keeps Touch ID convenient without making it load-bearing.
	passkeys *passkey.Store
	webauthn *passkey.Authenticator

	// compileSlots admits one compile at a time; the select on it never blocks,
	// so a second request is rejected immediately with 429.
	compileSlots chan struct{}
	compiler     *compile.Compiler

	// writeMu serialises every path that mutates the working tree. Both save
	// handlers write files and then run git in the same repository, so without
	// this two overlapping saves can collide on index.lock, commit a partial
	// set of files, or lose a field through a read-modify-write cycle.
	writeMu sync.Mutex

	mu     sync.RWMutex
	pdfs   map[string][]byte
	pdfAge []string

	// startedAt lets the health endpoint report liveness without touching disk.
	startedAt time.Time
}

func main() {
	addr := envOr("RESUMEKIT_ADDR", "0.0.0.0:8080")
	repo := envOr("RESUMEKIT_REPO", ".")
	token := os.Getenv("RESUMEKIT_TOKEN")
	rawSecret := os.Getenv("RESUMEKIT_TOTP_SECRET")

	// The runtime image carries no curl or wget, so the container health check
	// re-executes this binary instead of shelling out to an HTTP client.
	if len(os.Args) > 1 && os.Args[1] == "-healthcheck" {
		os.Exit(healthcheck(addr))
	}

	absRepo, err := filepath.Abs(repo)
	if err != nil {
		log.Fatalf("resolve repo path: %v", err)
	}

	secret, err := totp.ParseSecret(rawSecret)
	if err != nil {
		// Starting without a login would expose an editor that can rewrite the
		// résumé and push to the repository.
		log.Fatalf("RESUMEKIT_TOTP_SECRET is required and must be valid base32: %v\n"+
			"generate one with: resumekit totp", err)
	}

	instance := &server{
		secret:       secret,
		guard:        totp.NewGuard(),
		repoRoot:     absRepo,
		blocksRoot:   filepath.Join(absRepo, "data", "blocks"),
		resumesRoot:  filepath.Join(absRepo, "resumes"),
		token:        token,
		compileSlots: make(chan struct{}, maxConcurrentCompiles),
		compiler:     compile.New(filepath.Join(os.TempDir(), "resumekit-work")),
		pdfs:         map[string][]byte{},
		startedAt:    time.Now(),
		git: &persist.Git{
			Dir:         absRepo,
			AuthorName:  envOr("RESUMEKIT_GIT_NAME", "resume-builder[bot]"),
			AuthorEmail: envOr("RESUMEKIT_GIT_EMAIL", "resume-builder@users.noreply.github.com"),
			Push:        os.Getenv("RESUMEKIT_GIT_PUSH") == "true",
		},
	}

	// Passkeys are optional. Without an origin the service runs exactly as
	// before, on the one-time code alone, so an existing deployment keeps
	// working until the origin is configured.
	instance.passkeys, err = passkey.Open(filepath.Join(absRepo, "data", "passkeys.json"))
	if err != nil {
		log.Fatalf("read passkeys: %v", err)
	}
	if origin := os.Getenv("RESUMEKIT_ORIGIN"); origin != "" {
		authenticator, originErr := passkey.New(instance.passkeys, origin)
		if originErr != nil {
			// A malformed origin disables passkeys and nothing else. Refusing to
			// start would take the whole editor down over an optional
			// convenience, and the value is easy to mistype — "example.dev"
			// without a scheme parses to an empty host.
			log.Printf("passkeys disabled: RESUMEKIT_ORIGIN=%q is not usable: %v", origin, originErr)
			log.Printf("passkeys expect the full public URL, for example https://resume.sankalpjha.dev")
		} else {
			instance.webauthn = authenticator
			log.Printf("passkeys enabled for %s (%d enrolled)", origin, instance.passkeys.Len())
		}
	} else {
		log.Printf("passkeys disabled: set RESUMEKIT_ORIGIN to the public URL to enable Touch ID")
	}

	if _, err := block.Load(instance.blocksRoot); err != nil {
		log.Fatalf("block store at %s is not readable: %v", instance.blocksRoot, err)
	}

	log.Printf("resumed listening on %s (repo %s, push=%v, api-token=%v)",
		addr, absRepo, instance.git.Push, token != "")
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           instance.routes(),
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      2 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()

	// Unauthenticated, read-only, and does not touch the repository: this is the
	// health path Myprod polls.
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"uptimeS": int(time.Since(s.startedAt).Seconds()),
		})
	})

	mux.HandleFunc("POST /api/login", s.handleLogin)

	// Signing in with a passkey cannot require a session, because it is how a
	// session is obtained. WebAuthn is not guessable, so unlike the six-digit
	// code these need no rate limiting of their own.
	// Whether a passkey can be used is not sensitive, and the login screen needs
	// it before any session exists. A dedicated status route keeps the page from
	// probing the login endpoint and logging its refusal as a console error.
	mux.HandleFunc("GET /api/passkey/available", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"enabled":  s.webauthn != nil,
			"enrolled": s.passkeys.Len(),
		})
	})
	mux.HandleFunc("POST /api/passkey/login/begin", s.handlePasskeyLoginBegin)
	mux.HandleFunc("POST /api/passkey/login/finish", s.handlePasskeyLoginFinish)

	mux.Handle("GET /api/passkey", s.authed(s.handlePasskeyList))
	mux.Handle("POST /api/passkey/register/begin", s.authed(s.handlePasskeyRegisterBegin))
	mux.Handle("POST /api/passkey/register/finish", s.authed(s.handlePasskeyRegisterFinish))
	mux.Handle("DELETE /api/passkey/{id}", s.authed(s.handlePasskeyRemove))

	mux.Handle("GET /api/state", s.authed(s.handleState))
	mux.Handle("GET /api/pdf/{id}", s.authed(s.handlePDF))
	mux.Handle("POST /api/preview", s.authed(s.handlePreview))
	mux.Handle("POST /api/tex", s.authed(s.handleTex))
	mux.Handle("POST /api/resume/{id}", s.authed(s.handleSaveResume))
	mux.Handle("DELETE /api/resume/{id}", s.authed(s.handleDeleteResume))
	mux.Handle("POST /api/refresh", s.authed(s.handleRefresh))
	mux.Handle("POST /api/block/{id}", s.authed(s.handleSaveBlock))

	mux.HandleFunc("GET /favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		icon, err := os.ReadFile(filepath.Join(s.repoRoot, "src", "app", "favicon.ico"))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		// The portfolio's favicon.ico is actually a PNG with an .ico extension.
		// Announcing it as image/x-icon makes browsers reject it and show no
		// icon at all, so the type is sniffed from the bytes instead of assumed
		// from the filename.
		w.Header().Set("Content-Type", http.DetectContentType(icon))
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Write(icon)
	})

	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		page, err := uiFiles.ReadFile("ui/index.html")
		if err != nil {
			http.Error(w, "ui missing", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(page)
	})

	return securityHeaders(mux)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		next.ServeHTTP(w, r)
	})
}

// authed gates every mutating and data-bearing route behind the shared token.
func (s *server) authed(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.authorized(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)
		next(w, r)
	})
}

func (s *server) authorized(r *http.Request) bool {
	expected := sessionValue(s.secret.Base32)
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		if subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(expected)) == 1 {
			return true
		}
	}
	// A bearer header keeps the API usable from scripts and from curl. It is
	// optional: with no token configured, nothing can authenticate this way.
	if s.token == "" {
		return false
	}
	header := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	return subtle.ConstantTimeCompare([]byte(header), []byte(s.token)) == 1
}

// sessionValue derives the cookie value from the shared secret, so the secret
// itself is never what sits in the browser jar.
func sessionValue(secret string) string {
	sum := sha256.Sum256([]byte("resumekit-session:" + secret))
	return hex.EncodeToString(sum[:])
}

func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad request"})
		return
	}

	if err := s.guard.Check(s.secret, body.Code, time.Now()); err != nil {
		var locked totp.ErrLocked
		if errors.As(err, &locked) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{
				"error":     err.Error(),
				"lockedFor": int(locked.Remaining.Seconds()),
			})
			return
		}
		// A small delay on every wrong code costs a human nothing and removes
		// the value of rapid-fire guessing before the lockout even engages.
		time.Sleep(400 * time.Millisecond)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}
	s.openSession(w, r)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// openSession issues the session cookie both sign-in paths share.
func (s *server) openSession(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    sessionValue(s.secret.Base32),
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int((30 * 24 * time.Hour).Seconds()),
	})
}

func (s *server) passkeysReady(w http.ResponseWriter) bool {
	if s.webauthn == nil {
		writeJSON(w, http.StatusNotImplemented, map[string]string{
			"error": "passkeys are not configured on this server"})
		return false
	}
	return true
}

func (s *server) handlePasskeyLoginBegin(w http.ResponseWriter, r *http.Request) {
	if !s.passkeysReady(w) {
		return
	}
	options, token, err := s.webauthn.BeginLogin()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"options": options, "token": token})
}

func (s *server) handlePasskeyLoginFinish(w http.ResponseWriter, r *http.Request) {
	if !s.passkeysReady(w) {
		return
	}
	token := r.URL.Query().Get("token")
	if err := s.webauthn.FinishLogin(token, r); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}
	s.openSession(w, r)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handlePasskeyList(w http.ResponseWriter, r *http.Request) {
	devices := []map[string]any{}
	for _, record := range s.passkeys.List() {
		devices = append(devices, map[string]any{
			"id": record.ID(), "label": record.Label,
			"addedAt": record.AddedAt, "lastUsedAt": record.LastUsedAt,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"devices": devices, "enabled": s.webauthn != nil})
}

func (s *server) handlePasskeyRegisterBegin(w http.ResponseWriter, r *http.Request) {
	if !s.passkeysReady(w) {
		return
	}
	var body struct {
		Label string `json:"label"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	options, token, err := s.webauthn.BeginRegistration(body.Label)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"options": options, "token": token})
}

func (s *server) handlePasskeyRegisterFinish(w http.ResponseWriter, r *http.Request) {
	if !s.passkeysReady(w) {
		return
	}
	token := r.URL.Query().Get("token")
	record, err := s.webauthn.FinishRegistration(token, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Only public keys are written, so committing them is safe and is what
	// carries an enrolled device across a redeploy.
	s.writeMu.Lock()
	committed, gitErr := s.git.Commit(r.Context(),
		fmt.Sprintf("passkey: enrol %q", record.Label), s.passkeys.Path())
	s.writeMu.Unlock()

	response := map[string]any{"status": "enrolled", "id": record.ID(),
		"label": record.Label, "committed": committed}
	if gitErr != nil {
		response["gitError"] = gitErr.Error()
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *server) handlePasskeyRemove(w http.ResponseWriter, r *http.Request) {
	if err := s.passkeys.Remove(r.PathValue("id")); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	s.writeMu.Lock()
	committed, gitErr := s.git.Commit(r.Context(), "passkey: remove a device", s.passkeys.Path())
	s.writeMu.Unlock()

	response := map[string]any{"status": "removed", "committed": committed}
	if gitErr != nil {
		response["gitError"] = gitErr.Error()
	}
	writeJSON(w, http.StatusOK, response)
}

// blockSummary is the shape the editor needs to draw the block palette.
type blockSummary struct {
	ID       string   `json:"id"`
	Kind     string   `json:"kind"`
	Tags     []string `json:"tags"`
	Variants []string `json:"variants"`

	Content map[string]any `json:"content"`
	Machine map[string]any `json:"machine,omitempty"`

	// VariantData carries each variant's overlay. Without it the editor can
	// only show base content, so editing a block that renders through a variant
	// would display text the résumé does not actually use.
	VariantData map[string]map[string]any `json:"variantData,omitempty"`
}

func (s *server) handleState(w http.ResponseWriter, r *http.Request) {
	store, err := block.Load(s.blocksRoot)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	manifests, err := manifest.LoadAll(s.resumesRoot)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	blocks := make([]blockSummary, 0, store.Len())
	for _, current := range store.All() {
		blocks = append(blocks, blockSummary{
			ID:          current.ID,
			Kind:        string(current.Kind),
			Tags:        current.Tags,
			Variants:    current.VariantNames(),
			Content:     current.Content,
			Machine:     current.Machine,
			VariantData: current.Variants,
		})
	}

	status, _ := s.git.Status(r.Context())
	branch, _ := s.git.Branch(r.Context())

	writeJSON(w, http.StatusOK, map[string]any{
		"blocks":  blocks,
		"resumes": manifests,
		"engine":  s.compiler.Engine(),
		"git": map[string]any{
			"branch": branch,
			"dirty":  strings.TrimSpace(status) != "",
			"push":   s.git.Push,
		},
	})
}

// handleTex returns the generated LaTeX without compiling it, so the source can
// be copied into Overleaf or kept alongside the PDF.
func (s *server) handleTex(w http.ResponseWriter, r *http.Request) {
	var target manifest.Manifest
	if err := json.NewDecoder(r.Body).Decode(&target); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := target.Validate(); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	store, err := block.Load(s.blocksRoot)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	renderer, err := render.New(store)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	source, err := renderer.Render(&target)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	engine := s.compiler.Engine()
	// The banner rides inside the file so a copied .tex still says what builds
	// it. The preamble uses fontspec, which plain pdflatex cannot handle.
	banner := fmt.Sprintf("%% Generated by resumekit from résumé %q.\n"+
		"%% Engine: %s\n"+
		"%% Requires a Unicode engine (XeTeX or LuaTeX); pdflatex will not build this.\n\n",
		target.ID, engine)

	writeJSON(w, http.StatusOK, map[string]any{
		"tex":      banner + source,
		"engine":   engine,
		"filename": target.ID + ".tex",
	})
}

func (s *server) handlePDF(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	pdf, ok := s.pdfs[r.PathValue("id")]
	s.mu.RUnlock()
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", "inline; filename=\"preview.pdf\"")
	w.Header().Set("Cache-Control", "no-store")
	w.Write(pdf)
}

func (s *server) handlePreview(w http.ResponseWriter, r *http.Request) {
	var target manifest.Manifest
	if err := json.NewDecoder(r.Body).Decode(&target); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := target.Validate(); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Reject rather than queue without bound when the node is already busy.
	select {
	case s.compileSlots <- struct{}{}:
		defer func() { <-s.compileSlots }()
	default:
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "compiler busy, retry shortly"})
		return
	}

	store, err := block.Load(s.blocksRoot)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	renderer, err := render.New(store)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	source, err := renderer.Render(&target)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), compileTimeout)
	defer cancel()
	result, err := s.compiler.Run(ctx, source)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}

	id := s.storePDF(result.PDF)
	overfull := make([]map[string]any, 0, len(result.Overfull))
	for _, item := range result.Overfull {
		overfull = append(overfull, map[string]any{"points": item.Points, "detail": item.Detail})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"pdf":        "/api/pdf/" + id,
		"pages":      result.Pages,
		"pagesKnown": result.PagesKnown,
		"maxPages":   target.MaxPages,
		"overfull":   overfull,
		"savings":    savings(store, renderer, &target),
	})
}

// savings measures what each unused variant would shorten the document by, so
// the editor can show "where do I get a line back from" beside the page count.
func savings(store *block.Store, renderer *render.Renderer, target *manifest.Manifest) []map[string]any {
	var found []map[string]any
	for _, section := range target.Sections {
		for _, entry := range section.Blocks {
			source, ok := store.Get(entry.Block)
			if !ok {
				continue
			}
			inUse, err := renderer.RenderBlock(source, section.Layout, entry.Variant, entry.Override)
			if err != nil {
				continue
			}
			current := entry.Variant
			if current == "" {
				current = block.VariantFull
			}
			for _, name := range source.VariantNames() {
				if name == current {
					continue
				}
				candidate := name
				if name == block.VariantFull {
					candidate = ""
				}
				alternative, err := renderer.RenderBlock(source, section.Layout, candidate, entry.Override)
				if err != nil {
					continue
				}
				if delta := len(inUse) - len(alternative); delta > 0 {
					found = append(found, map[string]any{
						"block": entry.Block, "from": current, "to": name, "chars": delta,
					})
				}
			}
		}
	}
	sort.Slice(found, func(i, j int) bool {
		return found[i]["chars"].(int) > found[j]["chars"].(int)
	})
	return found
}

func (s *server) storePDF(pdf []byte) string {
	sum := sha256.Sum256(pdf)
	id := hex.EncodeToString(sum[:8]) + strconv.FormatInt(time.Now().UnixNano(), 36)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.pdfs[id] = pdf
	s.pdfAge = append(s.pdfAge, id)
	for len(s.pdfAge) > maxCachedPDFs {
		delete(s.pdfs, s.pdfAge[0])
		s.pdfAge = s.pdfAge[1:]
	}
	return id
}

func (s *server) handleSaveResume(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !safeID(id) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid résumé id"})
		return
	}
	var target manifest.Manifest
	if err := json.NewDecoder(r.Body).Decode(&target); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if target.ID != id {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id mismatch"})
		return
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	path := filepath.Join(s.resumesRoot, id+".yaml")
	if err := target.Save(path); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	committed, err := s.git.Commit(r.Context(),
		fmt.Sprintf("resume(%s): update layout from builder", id), path)
	response := map[string]any{"status": "saved", "committed": committed}
	if err != nil {
		response["gitError"] = err.Error()
	}
	writeJSON(w, http.StatusOK, response)
}

// handleRefresh fast-forwards the working copy to origin.
//
// The block store is read from disk and cloned once at startup, so blocks that
// CI committed after this container started are invisible to it. This is how a
// running builder picks them up without a redeploy.
func (s *server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	output, err := s.git.Pull(r.Context())
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	store, err := block.Load(s.blocksRoot)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": output, "blocks": store.Len()})
}

// handleDeleteResume removes a manifest and the PDF it produced.
func (s *server) handleDeleteResume(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !safeID(id) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid résumé id"})
		return
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	path := filepath.Join(s.resumesRoot, id+".yaml")
	target, err := manifest.Load(path)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such résumé"})
		return
	}

	// The built PDF goes with the manifest. Leaving it behind would keep serving
	// a résumé that can no longer be rebuilt or edited.
	paths := []string{path}
	if target.Output != "" {
		built := filepath.Join(s.repoRoot, filepath.FromSlash(target.Output))
		if _, err := os.Stat(built); err == nil {
			paths = append(paths, built)
		}
	}

	committed, err := s.git.Remove(r.Context(), fmt.Sprintf("resume(%s): delete", id), paths...)
	response := map[string]any{"status": "deleted", "committed": committed}
	if err != nil {
		response["gitError"] = err.Error()
	}
	writeJSON(w, http.StatusOK, response)
}

// saveBlockRequest carries an edit that is being promoted out of a single
// résumé and into the shared block library.
type saveBlockRequest struct {
	// Scope is "variant" to write a named overlay, or "base" to rewrite the
	// block's own content for every résumé that has not overridden it.
	Scope   string         `json:"scope"`
	Variant string         `json:"variant"`
	Fields  map[string]any `json:"fields"`
}

func (s *server) handleSaveBlock(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body saveBlockRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if len(body.Fields) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no fields to save"})
		return
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	store, err := block.Load(s.blocksRoot)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	target, ok := store.Get(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "unknown block"})
		return
	}

	var message string
	switch body.Scope {
	case "base":
		for key, value := range body.Fields {
			target.Content[key] = value
		}
		message = fmt.Sprintf("blocks(%s): update base content", id)
	case "variant":
		if body.Variant == "" || body.Variant == block.VariantFull {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": `a variant needs a name other than "full"`})
			return
		}
		if target.Variants == nil {
			target.Variants = map[string]map[string]any{}
		}
		if target.Variants[body.Variant] == nil {
			target.Variants[body.Variant] = map[string]any{}
		}
		for key, value := range body.Fields {
			target.Variants[body.Variant][key] = value
		}
		message = fmt.Sprintf("blocks(%s): update variant %q", id, body.Variant)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": `scope must be "base" or "variant"`})
		return
	}

	if err := store.Save(target); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	committed, err := s.git.Commit(r.Context(), message, store.Path(id))
	response := map[string]any{"status": "saved", "committed": committed}
	if err != nil {
		response["gitError"] = err.Error()
	}
	writeJSON(w, http.StatusOK, response)
}

// safeID refuses anything that could escape the manifest directory.
func safeID(id string) bool {
	if id == "" || len(id) > 64 || strings.ContainsAny(id, `/\.`) {
		return false
	}
	for _, symbol := range id {
		switch {
		case symbol >= 'a' && symbol <= 'z', symbol >= '0' && symbol <= '9', symbol == '-', symbol == '_':
		default:
			return false
		}
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

// healthcheck probes the local /healthz endpoint and maps the result onto a
// process exit code for Docker's HEALTHCHECK.
func healthcheck(addr string) int {
	host := addr
	if strings.HasPrefix(host, "0.0.0.0:") {
		host = "127.0.0.1:" + strings.TrimPrefix(host, "0.0.0.0:")
	}
	client := &http.Client{Timeout: 4 * time.Second}
	response, err := client.Get("http://" + host + "/healthz")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "health returned %s\n", response.Status)
		return 1
	}
	return 0
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
