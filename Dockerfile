FROM node:20-slim

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

# Copy requirements and install pinned Python dependencies
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt

# Add venv to PATH
ENV PATH="/opt/venv/bin:$PATH"

# Install pinned Node.js dependencies
COPY package.json package-lock.json* /opt/node/
RUN cd /opt/node && npm install --omit=dev
ENV PATH="/opt/node/node_modules/.bin:$PATH"

WORKDIR /data

# Default: show versions
CMD ["sh", "-c", "echo 'node:' && node --version && echo 'npm:' && npm --version && echo 'xml2rfc:' && xml2rfc --version && echo 'rfclint:' && rfclint --version"]
