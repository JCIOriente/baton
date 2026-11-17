# The `validate` steps in .baton/config.json are the source of truth for checks: `baton verify` runs
# them locally and `baton verify --stage ci` in GitHub CI. `make ci` is a convenience that runs the same recipes.
.PHONY: ci secrets lint test plugin-validate evals

ci: secrets lint test plugin-validate

secrets:
	gitleaks git --no-banner --redact .

lint:
	npm run lint

test:
	npm test

plugin-validate:
	claude plugin validate .

# Skill trigger evals: paid Claude runs (~$6), so not part of ci. See CONTRIBUTING.md.
evals:
	claude plugin eval . --scaffold --trust-plugin --ablation none --threshold 0.8 --no-publish --allow-tools Write Edit Bash
