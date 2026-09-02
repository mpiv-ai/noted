type CompanionNoteInput = {
  title: string;
  created: string;
  summary: string;
  htmlFileName: string;
  threadId: string;
  profile: string;
};

export function buildCompanionNote(input: CompanionNoteInput): string {
  const title = input.title.replaceAll('"', '\\"');
  const summary = input.summary.replaceAll('"', '\\"');
  return `---
title: "${title}"
created: "${input.created}"
profile: ${input.profile}
status: active
executive_summary: "${summary}"
source_refs:
  - "bb thread: ${input.threadId}"
  - "[[${input.htmlFileName}]]"
---

# ${input.title}

${input.summary}

Artifact: [[${input.htmlFileName}]]

bb thread: ${input.threadId}
`;
}
