FROM ruby:3.2-slim

ENV KRAMDOWN_RFC_VERSION=1.7.30
ENV XML2RFC_VERSION=3.31.0
ENV RFCLINT_VERSION=1.0.0

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3-pip \
      python3-venv \
      build-essential \
      && \
    rm -rf /var/lib/apt/lists/*

RUN gem install kramdown-rfc -v "$KRAMDOWN_RFC_VERSION"

RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir \
      xml2rfc==$XML2RFC_VERSION \
      rfclint==$RFCLINT_VERSION

# Add venv to PATH
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /data

# Default: show versions
CMD ["sh", "-c", "echo 'kramdown-rfc:' && kdrfc --version && echo 'xml2rfc:' && xml2rfc --version && echo 'rfclint:' && rfclint --version"]
