# RFC 7991 Element Reference

Complete xml2rfc v3 vocabulary reference.

## Document Structure

### `<rfc>` (root)
```xml
<rfc xmlns:xi="http://www.w3.org/2001/XInclude"
     ipr="trust200902"
     docName="draft-name-00"
     category="std|info|exp|bcp|historic"
     submissionType="IETF|IAB|IRTF|independent"
     consensus="true|false"
     version="3">
```

**Attributes:**
- `ipr` - IPR statement: `trust200902`, `noModificationTrust200902`, `noDerivativesTrust200902`
- `docName` - Draft name (e.g., `draft-ietf-wg-topic-00`)
- `category` - `std` (Standards Track), `info`, `exp`, `bcp`, `historic`
- `submissionType` - `IETF`, `IAB`, `IRTF`, `independent`
- `consensus` - Whether document has consensus
- `version` - Must be `3` for v3

**Content:** `<link>*`, `<front>`, `<middle>`, `<back>?`

---

### `<front>`
Document metadata.

**Content (in order):**
1. `<title>`
2. `<seriesInfo>*`
3. `<author>+`
4. `<date>?`
5. `<area>?`
6. `<workgroup>*`
7. `<keyword>*`
8. `<abstract>?`
9. `<note>*`

### `<title>`
```xml
<title abbrev="Short Title">Full Document Title</title>
```

### `<seriesInfo>`
```xml
<seriesInfo name="Internet-Draft" value="draft-name-00"/>
<seriesInfo name="RFC" value="9999"/>
```

### `<author>`
```xml
<author initials="J." surname="Smith" fullname="John Smith" role="editor">
  <organization>Example Corp</organization>
  <address>
    <postal>
      <street>123 Main St</street>
      <city>Anytown</city>
      <region>CA</region>
      <code>12345</code>
      <country>US</country>
    </postal>
    <phone>+1-555-555-5555</phone>
    <email>jsmith@example.com</email>
    <uri>https://example.com/~jsmith</uri>
  </address>
</author>
```

### `<date>`
```xml
<date year="2025" month="January" day="5"/>
<date/>  <!-- Use current date -->
```

### `<abstract>`
```xml
<abstract>
  <t>First paragraph.</t>
  <t>Second paragraph.</t>
</abstract>
```

---

### `<middle>`
Main document content.

**Content:** `<section>+`

### `<back>`
References and appendices.

**Content (in order):**
1. `<displayreference>*`
2. `<references>*`
3. `<section>*` (appendices)

---

## Section Elements

### `<section>`
```xml
<section anchor="section-id" numbered="true" toc="include">
  <name>Section Title</name>
  <!-- content -->
  <section><!-- subsections --></section>
</section>
```

**Attributes:**
- `anchor` - Document-wide unique ID
- `numbered` - `true` (default) or `false`
- `toc` - `include`, `exclude`, or `default`

**Content:**
- `<name>?`
- Block elements: `<artwork>`, `<aside>`, `<blockquote>`, `<dl>`, `<figure>`, `<ol>`, `<sourcecode>`, `<t>`, `<table>`, `<ul>`
- `<section>*` (nested)

---

## Block Elements

### `<t>` (paragraph)
```xml
<t anchor="para-id" keepWithNext="true" keepWithPrevious="false">
  Paragraph text with <em>emphasis</em>.
</t>
```

### `<artwork>`
ASCII art or diagrams.
```xml
<artwork type="ascii-art" name="diagram.txt"><![CDATA[
  +-------+
  | Box   |
  +-------+
]]></artwork>
```

**Attributes:**
- `type` - `ascii-art`, `svg`, etc.
- `name` - Filename for extraction
- `src` - External file reference

### `<sourcecode>`
Code listings.
```xml
<sourcecode type="abnf" name="grammar.abnf"><![CDATA[
rule = "value" / other-rule
]]></sourcecode>
```

**Attributes:**
- `type` - Language: `abnf`, `json`, `xml`, `http`, `c`, `python`, etc.
- `name` - Filename
- `markers` - `true` to show `<CODE BEGINS>/<CODE ENDS>`

### `<figure>`
Wrapper for artwork/sourcecode with caption.
```xml
<figure anchor="fig-1">
  <name>Figure Title</name>
  <artwork>...</artwork>
</figure>
```

### `<blockquote>`
```xml
<blockquote quotedFrom="RFC 9110" cite="https://...">
  <t>Quoted text.</t>
</blockquote>
```

### `<aside>`
Incidental text (indented).
```xml
<aside>
  <t>Note: This is supplementary information.</t>
</aside>
```

---

## List Elements

### `<ul>` (unordered)
```xml
<ul spacing="normal|compact" empty="false">
  <li>Item one</li>
  <li>Item two</li>
</ul>
```

### `<ol>` (ordered)
```xml
<ol type="1|a|A|i|I|%c|%d" start="1" spacing="normal">
  <li anchor="step-1">First step</li>
  <li>Second step</li>
</ol>
```

**`type` formats:**
- `1` - 1, 2, 3
- `a` - a, b, c
- `A` - A, B, C
- `i` - i, ii, iii
- `I` - I, II, III
- `%c` - (a), (b), (c)
- `%d` - 1., 2., 3.

### `<dl>` (definition list)
```xml
<dl spacing="normal" hanging="true" newline="false">
  <dt>Term</dt>
  <dd>Definition text.</dd>
  <dt>Another term</dt>
  <dd>Another definition.</dd>
</dl>
```

### `<li>` (list item)
Can contain block elements or inline content.
```xml
<li>Simple text</li>
<li>
  <t>Paragraph in list item.</t>
  <sourcecode>code here</sourcecode>
</li>
```

---

## Table Elements

### `<table>`
```xml
<table anchor="table-1">
  <name>Table Title</name>
  <thead>
    <tr>
      <th>Header 1</th>
      <th align="center">Header 2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Cell 1</td>
      <td colspan="1" rowspan="1">Cell 2</td>
    </tr>
  </tbody>
</table>
```

**`<th>` / `<td>` attributes:**
- `align` - `left`, `center`, `right`
- `colspan` - Number of columns to span
- `rowspan` - Number of rows to span

---

## Inline Elements

### Text Formatting
```xml
<strong>bold</strong>
<em>italic</em>
<tt>monospace</tt>
<sub>subscript</sub>
<sup>superscript</sup>
```

### `<bcp14>` (RFC 2119 keywords)
```xml
<bcp14>MUST</bcp14>
<bcp14>SHOULD NOT</bcp14>
```

### `<xref>` (internal reference)
```xml
<xref target="section-5"/>
<xref target="section-5" format="title"/>
<xref target="RFC9110" section="15.5.3"/>
```

**Attributes:**
- `target` - Anchor ID
- `format` - `default`, `title`, `counter`, `none`
- `section` - Section number in target document
- `relative` - Relative reference in target
- `sectionFormat` - `of`, `comma`, `parens`, `bare`

### `<eref>` (external reference)
```xml
<eref target="https://example.com">link text</eref>
<eref target="https://example.com"/>
```

### `<cref>` (comment)
```xml
<cref anchor="todo-1" source="JS">TODO: Fix this</cref>
```

### `<iref>` (index entry)
```xml
<iref item="authentication" subitem="Payment scheme"/>
```

---

## Reference Elements

### `<references>`
```xml
<references>
  <name>Normative References</name>
  <xi:include href="https://bib.ietf.org/public/rfc/bibxml/reference.RFC.9110.xml"/>
  <reference anchor="custom-ref">...</reference>
</references>
```

### `<reference>`
```xml
<reference anchor="RFC9110" target="https://www.rfc-editor.org/info/rfc9110">
  <front>
    <title>HTTP Semantics</title>
    <author initials="R." surname="Fielding" fullname="Roy Fielding"/>
    <date year="2022" month="June"/>
  </front>
  <seriesInfo name="RFC" value="9110"/>
  <seriesInfo name="DOI" value="10.17487/RFC9110"/>
</reference>
```

### Using XInclude for RFCs
```xml
<xi:include href="https://bib.ietf.org/public/rfc/bibxml/reference.RFC.2119.xml"/>
<xi:include href="https://bib.ietf.org/public/rfc/bibxml/reference.RFC.8174.xml"/>
```

### `<referencegroup>` (for STDs/BCPs)
```xml
<referencegroup anchor="STD68" target="https://www.rfc-editor.org/info/std68">
  <xi:include href="https://bib.ietf.org/public/rfc/bibxml/reference.RFC.5234.xml"/>
  <xi:include href="https://bib.ietf.org/public/rfc/bibxml/reference.RFC.7405.xml"/>
</referencegroup>
```

---

## Processing Instructions

### SVG Inclusion
```xml
<artwork type="svg">
  <svg xmlns="http://www.w3.org/2000/svg">...</svg>
</artwork>
```

### External File Inclusion
```xml
<artwork type="ascii-art" src="diagram.txt"/>
<sourcecode type="json" src="example.json"/>
```

---

## Common Patterns

### Requirements Section
```xml
<section anchor="requirements">
  <name>Requirements Language</name>
  <t>The key words "<bcp14>MUST</bcp14>", "<bcp14>MUST NOT</bcp14>",
  "<bcp14>REQUIRED</bcp14>", "<bcp14>SHALL</bcp14>", "<bcp14>SHALL NOT</bcp14>",
  "<bcp14>SHOULD</bcp14>", "<bcp14>SHOULD NOT</bcp14>", "<bcp14>RECOMMENDED</bcp14>",
  "<bcp14>NOT RECOMMENDED</bcp14>", "<bcp14>MAY</bcp14>", and "<bcp14>OPTIONAL</bcp14>"
  in this document are to be interpreted as described in BCP 14
  <xref target="RFC2119"/> <xref target="RFC8174"/> when, and only when, they
  appear in all capitals, as shown here.</t>
</section>
```

### IANA Considerations
```xml
<section anchor="iana">
  <name>IANA Considerations</name>
  <t>This document has no IANA actions.</t>
  <!-- OR -->
  <section anchor="iana-registry">
    <name>New Registry</name>
    <t>IANA is requested to create...</t>
  </section>
</section>
```

### Security Considerations
```xml
<section anchor="security">
  <name>Security Considerations</name>
  <t>Security considerations for this protocol...</t>
</section>
```
