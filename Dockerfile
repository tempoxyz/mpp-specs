FROM ruby:4.0.5-slim@sha256:86a2ff44ce474c1c9bd11dfb2fd7fe5408a5bfe8236b9bc6013e2c6ef4c02d39

# Install dependencies including WeasyPrint requirements for PDF generation
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3-pip \
      python3-venv \
      build-essential \
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

# Install Ruby dependencies (kramdown-rfc)
COPY Gemfile Gemfile.lock* /tmp/
RUN cd /tmp && bundle install && rm -f Gemfile Gemfile.lock

# Install Python dependencies (xml2rfc, rfclint)
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt

# Add venv to PATH
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /data

# Default: show versions
CMD ["sh", "-c", "echo 'kramdown-rfc:' && kramdown-rfc --version && echo 'xml2rfc:' && xml2rfc --version && echo 'rfclint:' && rfclint --version"]
