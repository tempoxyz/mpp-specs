export interface Author {
  fullname: string;
  email?: string;
  organization?: string;
}

export interface Meta {
  title: string;
  docName: string;
  category?: string;
  ipr?: string;
  submissionType?: string;
  consensus?: boolean;
  authors: Author[];
  abstract?: string;
  area?: string;
  workgroup?: string;
}

export interface Section {
  anchor: string;
  name: string;
  content: string[];
  children: Section[];
}

export interface CustomReference {
  anchor: string;
  originalName: string; // The original name as written in markdown, e.g., "Tempo Payment Method"
  title: string;
  author?: string;
  date?: string;
  target?: string;
}

export interface Document {
  meta: Meta;
  statusOfMemo?: string;
  copyrightNotice?: string;
  sections: Section[];
  references: {
    normative: string[];
    informative: string[];
    customNormative: CustomReference[];
    customInformative: CustomReference[];
  };
  appendices: Section[];
  acknowledgements?: string;
}

const BCP14_KEYWORDS = [
  "MUST NOT",
  "SHALL NOT",
  "SHOULD NOT",
  "NOT RECOMMENDED",
  "MUST",
  "REQUIRED",
  "SHALL",
  "SHOULD",
  "RECOMMENDED",
  "MAY",
  "OPTIONAL",
];

export function fromMarkdown(content: string): Document {
  const { frontmatter, body } = extractFrontmatter(content);
  const lines = body.split("\n");

  const meta = extractMeta(frontmatter);
  const abstract = extractAbstract(lines);
  const statusOfMemo = extractSection(lines, "Status of This Memo");
  const copyrightNotice = extractSection(lines, "Copyright Notice");
  const sections = extractSections(lines);
  const references = extractReferences(lines);
  const appendices = extractAppendices(lines);
  const acknowledgements = extractSection(lines, "Acknowledgements");

  return {
    meta: { ...meta, abstract },
    statusOfMemo,
    copyrightNotice,
    sections,
    references,
    appendices,
    acknowledgements,
  };
}

function extractFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const [, yaml, body] = match;
  const frontmatter = parseYaml(yaml);
  return { frontmatter, body };
}

function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let _currentKey: string | null = null;
  let currentArray: unknown[] | null = null;
  let inArray = false;

  for (const line of lines) {
    if (line.trim() === "") continue;

    const arrayItemMatch = line.match(/^ {2}- (.+)$/);
    const nestedObjectMatch = line.match(/^ {2}- (\w+):\s*(.*)$/);
    const keyValueMatch = line.match(/^(\w+):\s*(.*)$/);

    if (nestedObjectMatch && inArray && currentArray) {
      const [, key, value] = nestedObjectMatch;
      const obj: Record<string, string> = { [key]: value };
      currentArray.push(obj);
    } else if (inArray && currentArray && line.match(/^ {4}(\w+):\s*(.*)$/)) {
      const nestedKeyValue = line.match(/^ {4}(\w+):\s*(.*)$/);
      if (nestedKeyValue) {
        const [, key, value] = nestedKeyValue;
        const lastItem = currentArray[currentArray.length - 1] as Record<string, string>;
        if (lastItem && typeof lastItem === "object") {
          lastItem[key] = value;
        }
      }
    } else if (arrayItemMatch && inArray && currentArray) {
      currentArray.push(arrayItemMatch[1]);
    } else if (keyValueMatch) {
      const [, key, value] = keyValueMatch;
      if (value === "") {
        _currentKey = key;
        currentArray = [];
        inArray = true;
        result[key] = currentArray;
      } else {
        inArray = false;
        currentArray = null;
        if (value === "true") {
          result[key] = true;
        } else if (value === "false") {
          result[key] = false;
        } else {
          result[key] = value;
        }
      }
    }
  }

  return result;
}

function extractMeta(frontmatter: Record<string, unknown>): Meta {
  const title = (frontmatter.title as string) || "";
  const docName = (frontmatter.docName as string) || "";
  const category = frontmatter.category as string | undefined;
  const ipr = frontmatter.ipr as string | undefined;
  const submissionType = frontmatter.submissionType as string | undefined;
  const consensus = frontmatter.consensus as boolean | undefined;
  const area = frontmatter.area as string | undefined;
  const workgroup = frontmatter.workgroup as string | undefined;

  const authors: Author[] = [];
  const rawAuthors = frontmatter.author as Array<Record<string, string>> | undefined;
  if (rawAuthors) {
    for (const author of rawAuthors) {
      authors.push({
        fullname: author.fullname || "",
        email: author.email,
        organization: author.organization,
      });
    }
  }

  return { title, docName, category, ipr, submissionType, consensus, authors, area, workgroup };
}

function extractAbstract(lines: string[]): string | undefined {
  const startIdx = lines.findIndex((l) => /^##\s+Abstract/i.test(l));
  if (startIdx === -1) return undefined;

  const content: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ") || lines[i] === "---") break;
    content.push(lines[i]);
  }
  return content.join("\n").trim();
}

function extractSection(lines: string[], sectionName: string): string | undefined {
  const regex = new RegExp(`^##\\s+${sectionName}`, "i");
  const startIdx = lines.findIndex((l) => regex.test(l));
  if (startIdx === -1) return undefined;

  const content: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ") || lines[i] === "---") break;
    content.push(lines[i]);
  }
  return content.join("\n").trim();
}

function extractSections(lines: string[]): Section[] {
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  let currentSubsection: Section | null = null;
  let currentSubsubsection: Section | null = null;
  let inCodeBlock = false;
  const skipSections = [
    "abstract",
    "status of this memo",
    "copyright notice",
    "table of contents",
    "acknowledgements",
    "authors' addresses",
    "references",
    "appendix",
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }

    if (inCodeBlock) {
      if (currentSubsubsection) {
        currentSubsubsection.content.push(line);
      } else if (currentSubsection) {
        currentSubsection.content.push(line);
      } else if (currentSection) {
        currentSection.content.push(line);
      }
      continue;
    }

    const h2Match = line.match(/^##\s+(\d+)\.\s+(.+)/);
    const h3Match = line.match(/^###\s+(\d+)\.(\d+)\.\s+(.+)/);
    const h4Match = line.match(/^####\s+(\d+)\.(\d+)\.(\d+)\.\s+(.+)/);
    const appendixMatch = line.match(/^##\s+Appendix\s+([A-Z])[:.]?\s*(.+)?/i);
    const unnumberedH2 = line.match(/^##\s+(.+)/);

    if (h4Match) {
      const [, _sec, _sub, _subsub, name] = h4Match;
      currentSubsubsection = {
        anchor: slugify(name.trim()),
        name: name.trim(),
        content: [],
        children: [],
      };
      if (currentSubsection) {
        currentSubsection.children.push(currentSubsubsection);
      }
    } else if (h3Match) {
      const [, _sec, _sub, name] = h3Match;
      currentSubsubsection = null;
      currentSubsection = {
        anchor: slugify(name.trim()),
        name: name.trim(),
        content: [],
        children: [],
      };
      if (currentSection) {
        currentSection.children.push(currentSubsection);
      }
    } else if (h2Match) {
      const [, _num, name] = h2Match;
      const nameLower = name.toLowerCase();
      currentSubsubsection = null;
      currentSubsection = null;
      // Skip sections that are handled separately (references, appendices, etc.)
      if (skipSections.some((s) => nameLower.startsWith(s))) {
        currentSection = null;
        continue;
      }
      currentSection = {
        anchor: slugify(name.trim()),
        name: name.trim(),
        content: [],
        children: [],
      };
      sections.push(currentSection);
    } else if (appendixMatch || unnumberedH2) {
      if (unnumberedH2) {
        const name = unnumberedH2[1].toLowerCase();
        if (skipSections.some((s) => name.startsWith(s))) {
          currentSection = null;
          currentSubsection = null;
          currentSubsubsection = null;
          continue;
        }
        if (name.includes("reference")) {
          currentSection = null;
        }
      }
    } else if (line === "---") {
    } else {
      if (currentSubsubsection) {
        currentSubsubsection.content.push(line);
      } else if (currentSubsection) {
        currentSubsection.content.push(line);
      } else if (currentSection) {
        currentSection.content.push(line);
      }
    }
  }

  return sections;
}

function extractReferences(lines: string[]): {
  normative: string[];
  informative: string[];
  customNormative: CustomReference[];
  customInformative: CustomReference[];
} {
  const normative = new Set<string>();
  const informative = new Set<string>();
  const customNormative: CustomReference[] = [];
  const customInformative: CustomReference[] = [];

  let currentSection: "normative" | "informative" | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^###?\s+(\d+\.\d+\.?\s+)?Normative References/i.test(line)) {
      currentSection = "normative";
      continue;
    }
    if (/^###?\s+(\d+\.\d+\.?\s+)?Informative References/i.test(line)) {
      currentSection = "informative";
      continue;
    }
    if (/^###?\s+(\d+\.|\d+\.\d+\.?)?\s*[A-Z]/.test(line) && !line.includes("References")) {
      currentSection = null;
      continue;
    }

    if (currentSection) {
      // Check for RFC references
      const rfcMatches = line.matchAll(/\[RFC(\d+)\]/g);
      for (const match of rfcMatches) {
        if (currentSection === "normative") {
          normative.add(match[1]);
        } else {
          informative.add(match[1]);
        }
      }

      // Check for custom references: - **[Anchor]** "Title", <URL>.
      // Or: - **[Anchor]** Author, "Title", <URL>.
      // Or: - **[Anchor]** "Title", Work in Progress.
      const customRefMatch = line.match(
        /^-\s+\*\*\[([^\]]+)\]\*\*\s+(.+)$/,
      );
      if (customRefMatch && !/^\[RFC\d+\]$/.test(`[${customRefMatch[1]}]`)) {
        const anchor = customRefMatch[1];
        const rest = customRefMatch[2];

        // Collect continuation lines (indented lines that follow)
        let fullText = rest;
        while (i + 1 < lines.length && /^\s{2,}/.test(lines[i + 1]) && !lines[i + 1].match(/^-\s+\*\*/)) {
          i++;
          fullText += " " + lines[i].trim();
        }

        // Parse the reference text
        // Format 1: "Title", <URL>.
        // Format 2: Author, "Title", <URL>.
        // Format 3: Author, "Title", Work in Progress.
        let title = "";
        let author: string | undefined;
        let target: string | undefined;

        // Extract URL if present
        const urlMatch = fullText.match(/<([^>]+)>/);
        if (urlMatch) {
          target = urlMatch[1];
          fullText = fullText.replace(/<[^>]+>\.?/, "").trim();
        }

        // Extract title in quotes
        const titleMatch = fullText.match(/"([^"]+)"/);
        if (titleMatch) {
          title = titleMatch[1];
          // Everything before the title is the author
          const beforeTitle = fullText.substring(0, fullText.indexOf('"')).trim();
          if (beforeTitle && beforeTitle !== ",") {
            author = beforeTitle.replace(/,\s*$/, "").trim();
          }
        } else {
          // No quoted title, use the whole text as title
          title = fullText.replace(/[.,]\s*$/, "").trim();
        }

        const customRef: CustomReference = {
          anchor: slugify(anchor),
          originalName: anchor,
          title,
        };
        if (author) customRef.author = author;
        if (target) customRef.target = target;

        if (currentSection === "normative") {
          customNormative.push(customRef);
        } else {
          customInformative.push(customRef);
        }
      }
    }
  }

  return {
    normative: [...normative].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)),
    informative: [...informative].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)),
    customNormative,
    customInformative,
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractAppendices(lines: string[]): Section[] {
  const appendices: Section[] = [];
  let currentAppendix: Section | null = null;
  let currentSubsection: Section | null = null;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }

    if (inCodeBlock) {
      if (currentSubsection) {
        currentSubsection.content.push(line);
      } else if (currentAppendix) {
        currentAppendix.content.push(line);
      }
      continue;
    }

    const appendixMatch = line.match(/^##\s+Appendix\s+([A-Z])[:.]?\s*(.+)?/i);
    const subsectionMatch = line.match(/^###\s+([A-Z])\.(\d+)\.?\s+(.+)/i);

    if (appendixMatch) {
      const [, letter, name] = appendixMatch;
      currentSubsection = null;
      currentAppendix = {
        anchor: slugify(name || `Appendix ${letter}`),
        name: (name || `Appendix ${letter}`).trim(),
        content: [],
        children: [],
      };
      appendices.push(currentAppendix);
    } else if (subsectionMatch && currentAppendix) {
      const [, _letter, _num, name] = subsectionMatch;
      currentSubsection = {
        anchor: slugify(name),
        name: name.trim(),
        content: [],
        children: [],
      };
      currentAppendix.children.push(currentSubsection);
    } else if (line.startsWith("## ") && !line.includes("Appendix")) {
      if (line.includes("Acknowledgements") || line.includes("Authors' Addresses")) {
        currentAppendix = null;
        currentSubsection = null;
      }
    } else {
      if (currentSubsection) {
        currentSubsection.content.push(line);
      } else if (currentAppendix) {
        currentAppendix.content.push(line);
      }
    }
  }

  return appendices;
}

export function wrapBcp14Keywords(text: string): string {
  let result = text;
  for (const keyword of BCP14_KEYWORDS) {
    const regex = new RegExp(`(?<!<bcp14>)\\b${keyword}\\b(?!</bcp14>)`, "g");
    result = result.replace(regex, `<bcp14>${keyword}</bcp14>`);
  }
  return result;
}
