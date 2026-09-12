"use client";

import { Streamdown } from "streamdown";
import { unfoldMarkdownTables } from "@/lib/markdown";

export function MiraMarkdown({ text }: { text: string }) {
  return (
    <Streamdown
      mode="static"
      className="mira-md"
      controls={{ table: false }}
      tableMaxHeight={Infinity}
    >
      {unfoldMarkdownTables(text)}
    </Streamdown>
  );
}
