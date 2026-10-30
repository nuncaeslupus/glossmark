.PHONY: sync dev dev-icon dist build lint format test clean hero update-skills

CARGO = cd src-tauri && cargo

# ponytail: the Rust steps need the WebKitGTK dev headers; without them (and outside CI)
# they skip loudly instead of failing. CI always runs them.
WEBKIT := $(shell [ -n "$$CI" ] || pkg-config --exists webkit2gtk-4.1 2>/dev/null && echo yes)
define rust
	@if [ "$(WEBKIT)" = yes ]; then $(1); \
	else echo "SKIP $(1): install libwebkit2gtk-4.1-dev; CI runs it"; fi
endef

sync:
	npm ci

# GNOME on Wayland takes a window's icon from the desktop file named after its app id, and an
# uninstalled build has none. Hidden from the launcher, so it goes once the package is installed:
# a user entry would override the package's and hide the app.
DEV_DESKTOP := $(HOME)/.local/share/applications/nacho-viewer.desktop

dev-icon:
	@if test -e /usr/share/applications/nacho-viewer.desktop; then \
		rm -f $(DEV_DESKTOP); \
	elif test -d $(dir $(DEV_DESKTOP)); then \
		printf '[Desktop Entry]\nType=Application\nName=Nacho Viewer\nExec=$(CURDIR)/src-tauri/target/debug/nacho-viewer %%F\nIcon=$(CURDIR)/src-tauri/icons/128x128@2x.png\nNoDisplay=true\n' > $(DEV_DESKTOP); \
	fi

dev: dev-icon
	npm run tauri dev

# The frontend bundle; generate_context! in the Rust build reads it.
dist:
	npm run build

build:
	npm run tauri build -- --config '{"bundle":{"createUpdaterArtifacts":false}}'

lint: dist
	npm exec -- biome check .
	$(CARGO) fmt --check
	$(call rust,$(CARGO) clippy --all-targets -- -D warnings)

format:
	npm exec -- biome check --write .
	$(CARGO) fmt

test: dist
	npm test
	for t in scripts/*.test.sh; do bash "$$t" || exit 1; done
	$(call rust,$(CARGO) test)

clean:
	rm -rf dist src-tauri/target

# The README hero and screenshots, taken from the e2e build's demo document.
hero:
	node_modules/.bin/vite build --mode e2e
	node_modules/.bin/vite preview --mode e2e --port 4199 --strictPort & pid=$$!; \
	  trap 'kill $$pid' EXIT; \
	  until curl -sf -o /dev/null http://localhost:4199/e2e/shell.html; do \
	    kill -0 $$pid || exit 1; sleep 0.5; done; \
	  node scripts/hero.mjs

update-skills:
	git subtree pull --prefix .claude/skills https://github.com/nuncaeslupus/my-skills.git main --squash
