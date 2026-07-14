/** Pure builders for ACP session/prompt content blocks. */

export type ImageAttachment = {
  mimeType: string;
  data: string;
  uri?: string;
};

export type PromptBlock =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string; uri?: string };

export function buildPromptBlocks(
  text: string,
  images?: ImageAttachment[],
): PromptBlock[] {
  const prompt: PromptBlock[] = [];
  const trimmed = text.trim();
  if (trimmed) {
    prompt.push({ type: "text", text: trimmed });
  }
  if (images?.length) {
    for (const img of images) {
      const block: PromptBlock = {
        type: "image",
        mimeType: img.mimeType,
        data: img.data,
      };
      if (img.uri) (block as { uri?: string }).uri = img.uri;
      prompt.push(block);
    }
  }
  if (!prompt.length) {
    throw new Error("Empty prompt: provide text and/or images");
  }
  if (!trimmed && images?.length) {
    prompt.unshift({
      type: "text",
      text: "Analyze the attached image(s) / screenshot(s).",
    });
  }
  return prompt;
}
