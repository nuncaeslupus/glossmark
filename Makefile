.PHONY: sync dev dist build lint format test clean update-skills

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

dev:
	npm run tauri dev

# The frontend bundle; generate_context! in the Rust build reads it.
dist:
	npm run build

build:
	npm run tauri build

lint: dist
	npm exec -- biome check .
	$(CARGO) fmt --check
	$(call rust,$(CARGO) clippy --all-targets -- -D warnings)

format:
	npm exec -- biome check --write .
	$(CARGO) fmt

test: dist
	npm test
	$(call rust,$(CARGO) test)

clean:
	rm -rf dist src-tauri/target

update-skills:
	git subtree pull --prefix .claude/skills https://github.com/nuncaeslupus/my-skills.git main --squash
