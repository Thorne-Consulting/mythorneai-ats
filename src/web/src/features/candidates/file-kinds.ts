/** A first guess at what an uploaded file is, from its name. The person can change it before uploading. */
export function guessKind(fileName: string, hasResume: boolean) {
  const name = fileName.toLowerCase();
  if (/cover[\s_-]?letter|motivation/.test(name)) return 'CoverLetter';
  if (/portfolio|sample|case[\s_-]?study|work/.test(name)) return 'Portfolio';
  if (/resume|résumé|\bcv\b|curriculum/.test(name)) return 'Resume';
  // The first readable file on a record with no resume is most likely the resume.
  return !hasResume && /\.(pdf|docx)$/.test(name) ? 'Resume' : 'Other';
}
