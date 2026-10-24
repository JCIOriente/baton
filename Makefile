# Single entry point for checks: `make ci` runs locally (via `baton verify`) and in GitHub CI.
.PHONY: ci test validate secrets evals

ci: test validate secrets

test:
	npm test

validate:
	claude plugin validate .

secrets:
	gitleaks git --no-banner --redact .

# Skill trigger evals: paid Claude runs (~$6), so not part of ci. See CONTRIBUTING.md.
evals:
	claude plugin eval . --scaffold --trust-plugin --ablation none --threshold 0.8 --no-publish
