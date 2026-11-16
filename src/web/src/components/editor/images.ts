/**
 * Pictures that still need a description (`![](…)`), or are still uploading (a `blob:` address).
 * Saving waits for both; the server refuses a picture with no description too.
 */
export function imagesNeedingWork(markdown: string) {
  return {
    withoutAlt: (markdown.match(/!\[\s*\]\(/g) ?? []).length,
    uploading: (markdown.match(/!\[[^\]]*\]\(blob:/g) ?? []).length,
  };
}

/** The sentence to show beside Save, or null when every picture is ready. */
export function imageProblem(markdown: string) {
  const { withoutAlt, uploading } = imagesNeedingWork(markdown);
  if (uploading) return 'Wait for the picture to finish uploading.';
  if (withoutAlt === 1) return 'Describe the picture before you save.';
  if (withoutAlt > 1) return `Describe all ${withoutAlt} pictures before you save.`;
  return null;
}
