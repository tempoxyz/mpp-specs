.PHONY: docker-build build build-docker build-local check shell clean lint test site

docker-build:
	docker build -t ietf-spec-tools .

build: build-docker

build-docker:
	docker run --rm -v "$$(pwd)":/data ietf-spec-tools /data/scripts/gen.sh

build-local:
	./scripts/gen.sh

check:
	docker run --rm -v "$$(pwd)":/data ietf-spec-tools /data/scripts/check.sh

shell:
	docker run --rm -it -v "$$(pwd)":/data ietf-spec-tools bash

clean:
	rm -f artifacts/*.xml artifacts/*.html artifacts/*.txt artifacts/*.pdf

lint:
	docker run --rm -v "$$(pwd)":/data ietf-spec-tools python3 /data/scripts/lint_frontmatter.py

test:
	docker run --rm -v "$$(pwd)":/data -w /data/scripts ietf-spec-tools pytest test_lint_frontmatter.py -v

site: build
	@python3 scripts/gen_index.py
	@python3 scripts/gen_problems.py
	@python3 scripts/serve.py
