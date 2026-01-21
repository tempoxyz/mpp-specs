.PHONY: docker-build build check shell clean

docker-build:
	docker build -t ietf-spec-tools .

build:
	docker run --rm -v "$$(pwd)":/data ietf-spec-tools /data/scripts/gen.sh

check:
	docker run --rm -v "$$(pwd)":/data ietf-spec-tools /data/scripts/check.sh

shell:
	docker run --rm -it -v "$$(pwd)":/data ietf-spec-tools bash

clean:
	rm -f artifacts/*.xml artifacts/*.html artifacts/*.txt
