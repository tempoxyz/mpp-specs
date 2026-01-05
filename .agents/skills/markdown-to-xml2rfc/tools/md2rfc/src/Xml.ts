import * as Document from "./Document.js";

// Map of original reference names to their slugified anchors
let customRefMap: Map<string, string> = new Map();

export function fromMarkdown(markdown: string): string {
  return fromDocument(Document.fromMarkdown(markdown));
}

export function fromDocument(doc: Document.Document): string {
  // Build the custom reference map from both normative and informative refs
  // Maps original name (e.g., "Tempo Payment Method") to anchor (e.g., "tempo-payment-method")
  customRefMap = new Map();
  for (const ref of [...doc.references.customNormative, ...doc.references.customInformative]) {
    customRefMap.set(ref.originalName, ref.anchor);
  }

  const parts: string[] = [];

  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push("<!DOCTYPE rfc [");
  parts.push('  <!ENTITY nbsp "&#160;">');
  parts.push('  <!ENTITY zwsp "&#8203;">');
  parts.push("]>");
  parts.push('<rfc xmlns:xi="http://www.w3.org/2001/XInclude"');
  parts.push(`     ipr="${escapeXml(doc.meta.ipr || "trust200902")}"`);
  parts.push(`     docName="${escapeXml(doc.meta.docName)}"`);
  parts.push(`     submissionType="${escapeXml(doc.meta.submissionType || "IETF")}"`);
  parts.push(`     category="${escapeXml(doc.meta.category || "std")}"`);
  parts.push(`     consensus="${doc.meta.consensus !== false ? "true" : "false"}"`);
  parts.push('     version="3">');
  parts.push("");

  parts.push(buildFront(doc));
  parts.push("");
  parts.push(buildMiddle(doc));
  parts.push("");
  parts.push(buildBack(doc));
  parts.push("");
  parts.push("</rfc>");

  return parts.join("\n");
}

function buildFront(doc: Document.Document): string {
  const lines: string[] = [];
  lines.push("  <front>");
  lines.push(`    <title>${escapeXml(doc.meta.title)}</title>`);
  lines.push(`    <seriesInfo name="Internet-Draft" value="${escapeXml(doc.meta.docName)}"/>`);

  for (const author of doc.meta.authors) {
    lines.push(`    <author fullname="${escapeXml(author.fullname)}">`);
    if (author.organization || author.email) {
      lines.push("      <address>");
      if (author.email) {
        lines.push(`        <email>${escapeXml(author.email)}</email>`);
      }
      lines.push("      </address>");
    }
    lines.push("    </author>");
  }

  lines.push("    <date/>");

  if (doc.meta.abstract) {
    lines.push("    <abstract>");
    const paragraphs = doc.meta.abstract.split(/\n\n+/);
    for (const para of paragraphs) {
      if (para.trim()) {
        lines.push(`      <t>${processInlineElements(para.trim())}</t>`);
      }
    }
    lines.push("    </abstract>");
  }

  lines.push("  </front>");
  return lines.join("\n");
}

function buildMiddle(doc: Document.Document): string {
  const lines: string[] = [];
  lines.push("  <middle>");

  for (const section of doc.sections) {
    lines.push(buildSection(section, 2));
  }

  lines.push("  </middle>");
  return lines.join("\n");
}

function buildSection(section: Document.Section, indent: number): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];

  lines.push(`${pad}<section anchor="${section.anchor}">`);
  lines.push(`${pad}  <name>${escapeXml(section.name)}</name>`);

  const content = section.content.join("\n");
  lines.push(processContent(content, indent + 1));

  for (const child of section.children) {
    lines.push(buildSection(child, indent + 1));
  }

  lines.push(`${pad}</section>`);
  return lines.join("\n");
}

function buildCustomReference(ref: Document.CustomReference, indent: number): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];
  
  if (ref.target) {
    lines.push(`${pad}<reference anchor="${escapeXml(ref.anchor)}" target="${escapeXml(ref.target)}">`);
  } else {
    lines.push(`${pad}<reference anchor="${escapeXml(ref.anchor)}">`);
  }
  lines.push(`${pad}  <front>`);
  lines.push(`${pad}    <title>${escapeXml(ref.title)}</title>`);
  if (ref.author) {
    // Try to parse author - could be "Org" or "LastName, FirstName" or just a name
    const orgMatch = ref.author.match(/^([A-Z0-9]+)$/);
    if (orgMatch) {
      lines.push(`${pad}    <author><organization>${escapeXml(ref.author)}</organization></author>`);
    } else {
      lines.push(`${pad}    <author fullname="${escapeXml(ref.author)}"/>`);
    }
  } else {
    lines.push(`${pad}    <author/>`);
  }
  if (ref.date) {
    lines.push(`${pad}    <date year="${escapeXml(ref.date)}"/>`);
  }
  lines.push(`${pad}  </front>`);
  lines.push(`${pad}</reference>`);
  
  return lines.join("\n");
}

function buildBack(doc: Document.Document): string {
  const lines: string[] = [];
  lines.push("  <back>");

  const hasNormative = doc.references.normative.length > 0 || doc.references.customNormative.length > 0;
  const hasInformative = doc.references.informative.length > 0 || doc.references.customInformative.length > 0;

  if (hasNormative || hasInformative) {
    lines.push("    <references>");
    lines.push("      <name>References</name>");

    if (hasNormative) {
      lines.push("      <references>");
      lines.push("        <name>Normative References</name>");
      for (const rfc of doc.references.normative) {
        lines.push(
          `        <xi:include href="https://bib.ietf.org/public/rfc/bibxml/reference.RFC.${rfc}.xml"/>`,
        );
      }
      for (const ref of doc.references.customNormative) {
        lines.push(buildCustomReference(ref, 4));
      }
      lines.push("      </references>");
    }

    if (hasInformative) {
      lines.push("      <references>");
      lines.push("        <name>Informative References</name>");
      for (const rfc of doc.references.informative) {
        lines.push(
          `        <xi:include href="https://bib.ietf.org/public/rfc/bibxml/reference.RFC.${rfc}.xml"/>`,
        );
      }
      for (const ref of doc.references.customInformative) {
        lines.push(buildCustomReference(ref, 4));
      }
      lines.push("      </references>");
    }

    lines.push("    </references>");
  }

  for (const appendix of doc.appendices) {
    lines.push(buildSection(appendix, 2));
  }

  if (doc.acknowledgements) {
    lines.push('    <section anchor="acknowledgements" numbered="false">');
    lines.push("      <name>Acknowledgements</name>");
    lines.push(processContent(doc.acknowledgements, 3));
    lines.push("    </section>");
  }

  lines.push("  </back>");
  return lines.join("\n");
}

function processContent(content: string, indent: number): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];
  const rawLines = content.split("\n");

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];

    if (line.startsWith("```")) {
      const langMatch = line.match(/^```(\w*)/);
      const lang = langMatch?.[1] || "";
      const codeLines: string[] = [];
      i++;
      while (i < rawLines.length && !rawLines[i].startsWith("```")) {
        codeLines.push(rawLines[i]);
        i++;
      }
      i++;

      const isAsciiArt =
        lang === "" &&
        codeLines.some((l) => l.includes("+--") || l.includes("│") || l.includes("├"));
      const tag = isAsciiArt ? "artwork" : "sourcecode";
      const typeAttr =
        lang && !isAsciiArt ? ` type="${lang}"` : isAsciiArt ? ' type="ascii-art"' : "";

      lines.push(`${pad}<${tag}${typeAttr}><![CDATA[`);
      lines.push(codeLines.join("\n"));
      lines.push(`]]></${tag}>`);
      continue;
    }

    if (line.startsWith("| ")) {
      const tableLines: string[] = [];
      while (i < rawLines.length && rawLines[i].startsWith("|")) {
        tableLines.push(rawLines[i]);
        i++;
      }
      lines.push(processTable(tableLines, indent));
      continue;
    }

    if (line.match(/^[-*]\s+/)) {
      const listItems: string[] = [];
      while (i < rawLines.length && rawLines[i].match(/^[-*]\s+/)) {
        listItems.push(rawLines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      lines.push(`${pad}<ul>`);
      for (const item of listItems) {
        lines.push(`${pad}  <li>${processInlineElements(item)}</li>`);
      }
      lines.push(`${pad}</ul>`);
      continue;
    }

    if (line.match(/^\d+\.\s+/)) {
      const listItems: string[] = [];
      while (i < rawLines.length && rawLines[i].match(/^\d+\.\s+/)) {
        listItems.push(rawLines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      lines.push(`${pad}<ol type="1">`);
      for (const item of listItems) {
        lines.push(`${pad}  <li>${processInlineElements(item)}</li>`);
      }
      lines.push(`${pad}</ol>`);
      continue;
    }

    if (line.match(/^\*\*[^*]+\*\*\s*$/) && rawLines[i + 1]?.startsWith(": ")) {
      const dlItems: { term: string; def: string[] }[] = [];
      while (i < rawLines.length) {
        const termMatch = rawLines[i].match(/^\*\*([^*]+)\*\*\s*$/);
        if (!termMatch) break;
        const term = termMatch[1];
        i++;
        if (rawLines[i]?.startsWith(": ")) {
          const defLines: string[] = [rawLines[i].slice(2)];
          i++;
          while (
            i < rawLines.length &&
            rawLines[i].trim() !== "" &&
            !rawLines[i].match(/^\*\*[^*]+\*\*\s*$/) &&
            !rawLines[i].startsWith("## ")
          ) {
            defLines.push(rawLines[i].startsWith("  ") ? rawLines[i].slice(2) : rawLines[i]);
            i++;
          }
          dlItems.push({ term, def: defLines });
        } else {
          break;
        }
        while (i < rawLines.length && rawLines[i].trim() === "") i++;
      }
      lines.push(`${pad}<dl>`);
      for (const { term, def } of dlItems) {
        lines.push(`${pad}  <dt>${escapeXml(term)}</dt>`);
        lines.push(`${pad}  <dd><t>${processInlineElements(def.join(" "))}</t></dd>`);
      }
      lines.push(`${pad}</dl>`);
      continue;
    }

    if (line.trim() === "" || line === "---") {
      i++;
      continue;
    }

    if (line.startsWith("#")) {
      i++;
      continue;
    }

    let paragraph = line;
    i++;
    while (
      i < rawLines.length &&
      rawLines[i].trim() !== "" &&
      !rawLines[i].startsWith("```") &&
      !rawLines[i].startsWith("| ") &&
      !rawLines[i].match(/^[-*]\s+/) &&
      !rawLines[i].match(/^\d+\.\s+/) &&
      !rawLines[i].startsWith("#")
    ) {
      paragraph += ` ${rawLines[i]}`;
      i++;
    }

    if (paragraph.trim()) {
      const standaloneBoldMatch = paragraph.trim().match(/^\*\*([^*]+)\*\*$/);
      if (standaloneBoldMatch) {
        lines.push(`${pad}<t>${escapeXml(standaloneBoldMatch[1])}</t>`);
      } else {
        lines.push(`${pad}<t>${processInlineElements(paragraph.trim())}</t>`);
      }
    }
  }

  return lines.join("\n");
}

function processTable(tableLines: string[], indent: number): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];

  const rows = tableLines
    .filter((l) => !l.match(/^\|[-:| ]+\|$/))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );

  if (rows.length === 0) return "";

  lines.push(`${pad}<table>`);

  const [header, ...body] = rows;
  lines.push(`${pad}  <thead>`);
  lines.push(`${pad}    <tr>`);
  for (const cell of header) {
    lines.push(`${pad}      <th>${processInlineElements(cell)}</th>`);
  }
  lines.push(`${pad}    </tr>`);
  lines.push(`${pad}  </thead>`);

  if (body.length > 0) {
    lines.push(`${pad}  <tbody>`);
    for (const row of body) {
      lines.push(`${pad}    <tr>`);
      for (const cell of row) {
        lines.push(`${pad}      <td>${processInlineElements(cell)}</td>`);
      }
      lines.push(`${pad}    </tr>`);
    }
    lines.push(`${pad}  </tbody>`);
  }

  lines.push(`${pad}</table>`);
  return lines.join("\n");
}

function processInlineElements(text: string): string {
  let result = escapeXml(text);

  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  result = result.replace(/`([^`]+)`/g, "<tt>$1</tt>");
  result = result.replace(/\[RFC(\d+)\]/g, '<xref target="RFC$1"/>');
  
  // Convert custom references like [Tempo Payment Method] to xref
  result = result.replace(/\[([^\]]+)\]/g, (match, name) => {
    // Skip if it's a markdown link (will be handled below)
    if (result.includes(`${match}(`)) {
      return match;
    }
    // Check if this is a known custom reference
    const anchor = customRefMap.get(name);
    if (anchor) {
      return `<xref target="${anchor}"/>`;
    }
    // Not a known reference, leave as-is
    return match;
  });
  
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<eref target="$2">$1</eref>');

  result = Document.wrapBcp14Keywords(result);

  return result;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
