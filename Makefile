# Single entry point for checks: `make ci` runs locally (via `baton verify`) and in GitHub CI.
.PHONY: ci test validate secrets

ci: test validate secrets

test:
	npm test

validate:
	claude plugin validate .

secrets:
	gitleaks git --no-banner --redact .
