.PHONY: help install dev desktop build check test-e2e smoke-desktop

help:
	@echo "install        Install pinned npm dependencies"
	@echo "dev            Open the browser example through Vite"
	@echo "desktop        Run Vite and the Electron desktop"
	@echo "build          Type-check and build the renderer"
	@echo "check          Build and run focused TypeScript, desktop and Python checks"
	@echo "test-e2e       Run Playwright browser workflows"
	@echo "smoke-desktop  Build and test compiled desktop save/reopen in temporary state"

install:
	npm ci

dev:
	npm run dev

desktop:
	npm run desktop

build:
	npm run build

check:
	npm run check

test-e2e:
	npm run test:e2e

smoke-desktop: build
	node scripts/smoke-desktop.mjs

push:
	git add .
	git commit
	git push origin HEAD