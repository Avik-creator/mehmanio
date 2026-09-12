/** Turn glued GFM tables (`| a | |---| | b |`) into real row-per-line markdown. */
export function unfoldMarkdownTables(text: string): string {
  return text
    .replace(/:\s*\|/g, ":\n\n|")
    .replace(/\|\s+\|/g, "|\n|")
    .replace(/^(\|.+\|)\s+([^|\n]+)$/gm, "$1\n\n$2");
}
