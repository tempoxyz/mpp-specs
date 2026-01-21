FROM node:20-slim

ENV XML2RFC_VERSION=3.31.0
ENV RFCLINT_VERSION=1.0.0

# Install Python and WeasyPrint dependencies for PDF generation
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3-pip \
      python3-venv \
      # WeasyPrint dependencies for PDF generation
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libgdk-pixbuf-2.0-0 \
      libffi-dev \
      shared-mime-info \
      # Fonts
      fonts-noto \
      fonts-roboto \
      && \
    rm -rf /var/lib/apt/lists/*

# Install xml2rfc and rfclint in a virtual environment
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir \
      "xml2rfc[pdf]==$XML2RFC_VERSION" \
      rfclint==$RFCLINT_VERSION

# Add venv to PATH
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /data

# Default: show versions
CMD ["sh", "-c", "echo 'node:' && node --version && echo 'npm:' && npm --version && echo 'xml2rfc:' && xml2rfc --version && echo 'rfclint:' && rfclint --version"]
