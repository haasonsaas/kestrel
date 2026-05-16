BAZEL ?= $(shell if command -v bazelisk >/dev/null 2>&1; then command -v bazelisk; elif command -v bazel >/dev/null 2>&1; then command -v bazel; elif command -v go >/dev/null 2>&1; then printf '%s/bin/bazelisk' "$$(go env GOPATH)"; else printf bazelisk; fi)
BUILDIFIER ?= $(shell if command -v buildifier >/dev/null 2>&1; then command -v buildifier; elif command -v go >/dev/null 2>&1; then printf '%s/bin/buildifier' "$$(go env GOPATH)"; else printf buildifier; fi)
BAZEL_TARGETS ?= //...
BAZEL_REMOTE_CONFIG ?= remote-gcp-dev
BAZEL_RBE_SMOKE_TARGETS ?= //:kestrel_bazel_contract_test
BAZEL_CI_REMOTE_DOWNLOAD_FLAGS ?= --remote_download_outputs=minimal

.PHONY: bazel-check bazel-format bazel-mod-tidy bazel-rbe-smoke bazel-test bazel-test-remote

bazel-mod-tidy:
	$(BAZEL) mod tidy

bazel-format:
	$(BUILDIFIER) -r .

bazel-check: bazel-mod-tidy bazel-format bazel-test
	git diff --exit-code

bazel-test:
	$(BAZEL) test $(BAZEL_TARGETS)

bazel-test-remote:
	$(BAZEL) test --config=$(BAZEL_REMOTE_CONFIG) $(BAZEL_CI_REMOTE_DOWNLOAD_FLAGS) $(BAZEL_TARGETS)

bazel-rbe-smoke:
	BAZEL_TARGETS="$(BAZEL_RBE_SMOKE_TARGETS)" ./scripts/run-bazel-rbe.sh
