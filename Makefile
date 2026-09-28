SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help install dev desktop build check test-e2e smoke-desktop

help:
	@echo "collab-help    Hosted server install/deploy/backup/publish commands"
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
# Same host/key conventions as neologismotupi; overrides may live in your shell/SSH config.
DEPLOY_HOST ?= academiatupi.com
DEPLOY_USER ?= root
DEPLOY_PATH ?= /srv/pydicate-studio
SSH_IDENTITY ?= $(HOME)/.ssh/neologismotupi_ed25519
SSH_PORT ?= 22
STUDIO_REF ?= main
COLLAB_PUBLIC_URL ?= https://studio.academiatupi.com
SMTP_MODE ?= relay
NEOLOGISMO_PATH ?= /srv/nheenga-neologismos
export DEPLOY_HOST DEPLOY_USER DEPLOY_PATH SSH_IDENTITY SSH_PORT STUDIO_REF COLLAB_PUBLIC_URL SMTP_MODE NEOLOGISMO_PATH
export FILE REPO REVIEW_SHA CONFIRM EMAIL NAME IDS LOCAL_REVIEW_DIR LOCAL_REPOS_PARENT IMPORT_DIR MODE
export LOCAL_STUDIO_STATE LOCAL_PROJECT_PARENT

.PHONY: collab-help collab-install collab-redeploy collab-codex-auth collab-ssh collab-admin collab-start collab-stop collab-logs collab-psql collab-backup collab-db-backup collab-db-restore collab-restore collab-research collab-changes collab-publish collab-sync collab-local-install collab-test
collab-help:
	@echo 'collab-install/redeploy  Update release + copy attached desktop PDFs/evidence; preserve existing server work'
	@echo 'LOCAL_STUDIO_STATE=... LOCAL_PROJECT_PARENT=...  Optional desktop profile/workspace overrides for PDF transfer'
	@echo 'collab-ssh/admin/logs/psql/start/stop  Operations through the existing SSH identity'
	@echo 'collab-backup FILE=...   Full private DB + PDF/workspace/config checkpoint to laptop'
	@echo 'collab-db-backup FILE=... / collab-db-restore FILE=... CONFIRM=RESTORE-STUDIO-PRODUCTION@HOST'
	@echo 'collab-restore FILE=... CONFIRM=RESTORE-STUDIO-PRODUCTION@HOST  Restore full matching state; leaves app stopped'
	@echo 'collab-research FILE=...  All-time research export, excluding account and provider secrets'
	@echo 'collab-changes REPO=... FILE=...  Collect source diff and review manifest'
	@echo 'collab-publish REPO=... REVIEW_SHA=... FILE=...  Checkpoint, fetch bundle, push review branch, open PR using laptop gh login'
	@echo 'collab-sync REPO=...     After PR merge: safety backup + clean-tree fast-forward only'
	@echo 'collab-db-restore-local FILE=... LOCAL_REVIEW_DIR=...  Trusted dump into a new laptop-only PostgreSQL'
	@echo 'collab-submissions-local IDS=... FILE=...  Export chosen immutable snapshots from the restored DB'
	@echo 'collab-import FILE=... LOCAL_REPOS_PARENT=... IMPORT_DIR=...  New worktree branches off main; no publication/approval'
	@echo 'collab-record-import FILE=.../import-receipt.json  Register pushed Git commits; exact snapshot trailers are checked'
	@echo 'collab-notify MODE=off|hourly|daily  Send pending verified-merge digest; none by default'
	@echo 'collab-codex-auth       Privately replace the server Codex login from local auth.json'
	@echo 'collab-deploy           Update app + clean compatible branches + attached desktop PDFs; dirty work stays intact'

collab-install collab-redeploy collab-codex-auth collab-ssh collab-admin collab-start collab-stop collab-logs collab-psql collab-backup collab-db-backup collab-db-restore collab-restore collab-research collab-changes collab-publish collab-sync:
	@python3 scripts/collab/ops.py $(patsubst collab-%,%,$@)

collab-local-install:
	npm ci
	npm --prefix server ci
	npm run build:app

collab-test:
	npm --prefix server ci
	node --test server/tests/*.test.cjs
	python3 -m unittest discover -s scripts/collab/tests -v

.PHONY: collab-deploy collab-db-restore-local collab-submissions-local collab-psql-local collab-import collab-record-import collab-notify
collab-deploy: collab-redeploy

collab-db-restore-local:
	@python3 scripts/collab/local_review.py restore

collab-submissions-local:
	@python3 scripts/collab/local_review.py export

collab-psql-local:
	@python3 scripts/collab/local_review.py psql

collab-import:
	@test -n "$(FILE)" -a -n "$(LOCAL_REPOS_PARENT)" -a -n "$(IMPORT_DIR)" || { echo 'Set FILE, LOCAL_REPOS_PARENT and a new IMPORT_DIR'; exit 1; }
	@python3 scripts/collab/import_submissions.py --file "$(FILE)" --repos-parent "$(LOCAL_REPOS_PARENT)" --destination "$(IMPORT_DIR)"

collab-record-import collab-notify:
	@python3 scripts/collab/ops.py $(patsubst collab-%,%,$@)

.PHONY: collab-sso-config
export NEO_API_ENV_FILE
collab-sso-config:
	@python3 scripts/collab/ops.py sso-config
