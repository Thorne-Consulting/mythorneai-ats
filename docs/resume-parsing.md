# Resume parsing

Decided 2026-10-17. How a resume becomes a candidate profile, how that profile is stored, and how it is searched and shown.

## Rules

1. **The resume file is the only input.** The parsed profile is read-only. Nobody edits it by hand, not recruiters and not candidates, so nobody can make a candidate look stronger than their resume says. A wrong parse is fixed by re-parsing, or by the candidate uploading a corrected resume. The original stays attached.
2. **One schema drives everything.** The form the model fills in, the database tables, and the viewer all have the same shape. Add a field in one place and it flows to the others.
3. **Normalise until a filter is a dropdown or a number, then stop.** Enums and numbers for what recruiters filter on. Raw text, with typo-tolerant search, for everything else. Every normalised column sits next to the raw value it came from.
4. **Same file in, same profile out.** Model version and prompt version are pinned and recorded on every parse. Parse results are cached by a hash of the extracted text.

## Pipeline

```
upload ──▶ extract text ──▶ fill the form (LLM) ──▶ verify ──▶ write tables ──▶ compute ──▶ embed
```

1. **Extract text.** `FieldCure.DocumentParsers` as today (PdfPig for PDF, OpenXml for DOCX). The raw text is kept on the candidate as `ResumeText`; it feeds full-text search and the Text tab in the viewer. If the text layer is empty (scanned or outlined PDF), the attachment is marked `NeedsOcr` and parsing stops there until OCR exists.
2. **Fill the form.** One call through `Microsoft.Extensions.AI` (`IChatClient.GetResponseAsync<ResumeForm>()`), OpenAI behind it, strict JSON schema, temperature 0. The model gets the text and the form; the enums are given as closed lists. Instructions: copy from the text, leave blank if not present, never guess. Default model `gpt-5-mini`; a larger model is the fallback when verification fails badly.
3. **Verify.** For every company, title, school, certification and skill the model returned, check that it appears in `ResumeText` after normalisation (lower-case, strip punctuation). Set `Verified` per row. Nothing is dropped; unverified values are shown with a mark.
4. **Write tables.** Replace the candidate's rows in the tables below with the new ones. Store the raw form as `ResumeProfileJson` for audit and re-import.
5. **Compute.** Derived columns on `Candidate` are recalculated from the rows: years of experience, years of management, current title and employer, highest degree, per-skill years and last-used year.
6. **Embed.** Build a short structured text from the rows (not the raw resume), embed it, store in `ResumeEmbedding`. Used only for ranking against a job.

The existing `ResumeParseWorker` runs this. The seed queues the 24 sample resumes through it like any upload. `ResumeProfileReviewModal` (pick which parsed fields to apply) is removed: the parse applies in full or you re-parse.

## The form

```json
{
  "basics": {
    "firstName", "lastName", "email", "phone",
    "city", "region", "country",
    "willingToRelocate": true | false | null,
    "openToRemote":      true | false | null,
    "links": [{ "kind": "linkedin|github|portfolio|other", "url" }],
    "summary"
  },
  "work": [{
    "company", "title",
    "seniority":      "Intern|Junior|Mid|Senior|Lead|Manager|Director|Executive|Unknown",
    "employmentType": "FullTime|PartTime|Contract|Internship|Freelance|Volunteer|Unknown",
    "city", "region", "country", "isRemote",
    "start": { "year", "month" | null },
    "end":   { "year", "month" | null } | null,
    "managedPeople": int | null,
    "bullets": [],
    "skillsUsed": []
  }],
  "education": [{
    "school", "degree",
    "degreeLevel": "HighSchool|Associate|Bachelor|Master|Doctorate|Certificate|Bootcamp|Other",
    "field",
    "fieldNormalized": "Engineering|ComputerScience|Business|Health|Education|Arts|Sciences|Law|SocialSciences|Other",
    "startYear", "endYear", "inProgress",
    "gpa", "gpaScale", "honors"
  }],
  "skills": [{ "name", "category": "Programming|Framework|Tool|Cloud|Data|Design|Language|SoftSkill|Domain|Other" }],
  "certifications": [{ "name", "issuer", "year", "expiresYear", "url" }],
  "languages":      [{ "language", "proficiency": "Basic|Conversational|Professional|Fluent|Native" }],
  "projects":       [{ "name", "description", "url", "year", "skillsUsed": [] }],
  "publications":   [{ "title", "venue", "year", "url" }],
  "awards":         [{ "name", "issuer", "year" }],
  "unassignedText": []
}
```

`seniority`, `employmentType`, `degreeLevel`, `fieldNormalized` and `category` are judgments the model makes, not facts in the resume. They are shown as inferred in the viewer. `unassignedText` is every line the model could not place; it is how a missed job is found.

## Tables

Lookups shared across candidates:

```
Skill        Id, Name, NormalizedName, Category, Aliases[]
Company      Id, Name, NormalizedName
School       Id, Name, NormalizedName
```

Skills are seeded with a few hundred common names and aliases ("reactjs", "react.js" → "react") and the parser adds new ones. Company and School match on `NormalizedName` (lower-case, strip "inc", "llc", "ltd", "university of"), create if missing. Duplicates are merged by an admin later; no entity resolution on day one.

Per candidate:

```
Candidate                              (existing table, columns added)
  City, Region, Country                replaces Location
  WillingToRelocate?, OpenToRemote?
  LinkedInUrl, GitHubUrl, PortfolioUrl, OtherUrls[]
  Summary
  CurrentTitle, CurrentEmployerId
  Seniority                            enum
  YearsExperience, YearsManagement     decimal, computed
  HighestDegreeLevel                   enum, computed
  ResumeText, ResumeEmbedding          existing
  ResumeProfileJson                    jsonb, the raw form
  ResumeParsedAt, ResumeModel, ResumePromptVersion, ResumeTextHash

WorkExperience
  Id, CandidateId, CompanyId, CompanyNameRaw, Title
  Seniority, EmploymentType            enums
  City, Region, Country, IsRemote
  StartYear, StartMonth, EndYear, EndMonth, IsCurrent
  DurationMonths                       computed
  ManagedPeople?
  Description                          bullets joined
  SortOrder                            0 = most recent
  Verified

WorkExperienceSkill    WorkExperienceId, SkillId

Education
  Id, CandidateId, SchoolId, SchoolNameRaw
  Degree, DegreeLevel, Field, FieldNormalized
  StartYear?, EndYear?, IsInProgress
  Gpa?, GpaScale?, Honors
  Verified

CandidateSkill
  CandidateId, SkillId
  Source                               SkillsSection | JobDescription | Both
  YearsUsed?, LastUsedYear?            computed from the jobs that list it
  Verified

Certification        Id, CandidateId, Name, Issuer, Year?, ExpiresYear?, Url?, Verified
CandidateLanguage    CandidateId, Language, Proficiency
Project              Id, CandidateId, Name, Description, Url?, Year?
ProjectSkill         ProjectId, SkillId
Publication          Id, CandidateId, Title, Venue, Year?, Url?
Award                Id, CandidateId, Name, Issuer, Year?
```

The old `ResumeSkills`, `ResumeJobTitles`, `ResumeEducation`, `ResumeCertifications`, `ResumeLanguages`, `ResumeSummary` string-array columns go away once these exist.

### Computed columns

- `DurationMonths` = months between start and end (end = now when current).
- `YearsExperience` = union of all `WorkExperience` ranges with `EmploymentType` not Internship or Volunteer, overlaps merged, in years to one decimal.
- `YearsManagement` = same, over roles with `ManagedPeople > 0` or `Seniority` in Manager/Director/Executive.
- `CurrentTitle`, `CurrentEmployerId` = the role with `IsCurrent`, else `SortOrder = 0`.
- `HighestDegreeLevel` = max over `Education.DegreeLevel` by rank.
- `CandidateSkill.YearsUsed`, `LastUsedYear` = over the jobs linked through `WorkExperienceSkill`.

Pure functions over the rows. Re-run after every parse.

## Search

Three layers, each for a different question.

**Filters (tables, SQL).** Exact questions: skill, city, minimum years, degree level, seniority, employment type, managed people, graduated since, used skill X since year Y. Trigram indexes (`pg_trgm`, already enabled) on `Company.Name`, `WorkExperience.Title`, `School.Name`, `Skill.Name` so "Microsft" still matches. In EF Core these are ordinary `Where` and `Any`.

**Ranking (embeddings).** "Who fits this job?" when fit is fuzzy. Embed the job requirements, filter first on anything hard (location, must-have skill, minimum years), then rank the rest by cosine similarity on `ResumeEmbedding`. The in-memory comparison in `RankingEndpoints` is fine at hundreds of candidates; `pgvector` when it is tens of thousands. The embedding text is built from the rows:

```
Senior Software Engineer at Northstar Software (2021–present). Previously Software Engineer at Lakeside Labs.
Skills: react, typescript, node.js, postgresql, aws.
BS Computer Science, University of Illinois Chicago, 2018.
Built customer portal used by 40k users; cut response time 38%.
```

**Explanations (one small model call).** For the top few in a ranking, the model gets the job requirements and the candidate's structured text and writes two sentences: why they fit, what is missing. It explains; it never ranks and never changes data.

**Typed sentence → filter (one model call).** "Senior React devs near Chicago who've worked at a startup" becomes `{ skills: ["react"], minYears: 5, city: "Chicago", semanticQuery: "worked at an early-stage startup" }`. The structured part runs as SQL, the semantic part as the ranking query. The inferred filter is shown to the recruiter so they can correct it.

## The viewer

A **Resume** tab on the candidate page, two panes.

**Left: the original.** PDF via the attachment endpoint (`inline=true`) in an iframe or pdf.js. DOCX is converted to PDF on upload (LibreOffice headless) and both are stored, so the left pane is always a PDF.

**Right: the parsed profile, laid out like a resume.** Header (name, contact, links, location), then Summary, Experience as a timeline (company, title, dates, duration, seniority and type badges, bullets, skill chips), Education, Skills by category, Certifications, Languages, Projects, Publications, Awards. Empty sections hidden. Read-only.

- Values the verifier could not find in the text get an amber mark with "not found in the document".
- Inferred values (seniority, type, degree level, field, category) are visually marked as inferred.
- An **Unassigned** section at the bottom lists the lines the model placed nowhere.
- A **Re-parse** button on the attachment re-runs the pipeline, optionally with the larger model. Each run is logged with model and prompt version.

A third tab, **Text**, shows `ResumeText`. When a parse is wrong, this tells you whether extraction or the model is at fault.

Later: click a parsed value and highlight it on the PDF. PdfPig gives word coordinates; store character offsets with verified values and draw boxes over pdf.js. Not in the first build.

## Quality

`tests/server/ResumeParsingQualityTests.cs` keeps its baseline-ratchet: scores for every seed resume, and the build fails if any field drops below the recorded baseline. It extends from four scalar fields to the full form:

- Gold answers for the 24 seed resumes: work entries, education entries, skills, certifications, languages.
- Multi-entry fields are aligned to gold with the Hungarian algorithm on company+title (or school+degree) similarity, then scored per field: dates on (year, month), names by normalised substring, bullets by edit-distance similarity, everything else exact after normalisation.
- Precision, recall and F1 per field. Critical fields (name, email, phone, titles, employers, dates, skills) have a hard floor; the rest only may not regress.
- The scorecard is written to `tests/server/TestResults/resume-parsing-quality.md`.

Run it whenever the prompt, the schema or the model version changes.

## Build order

1. **Schema and tables.** The `ResumeForm` C# record, the EF entities and migration, the computed-column functions with unit tests.
2. **The parse.** `Microsoft.Extensions.AI` with the OpenAI provider, the prompt, the verifier, writing rows, caching by text hash. Swap into `ResumeParseWorker`. Remove `ResumeProfileReviewModal` and the regex parser's field guessing (keep its text extraction).
3. **Quality test.** Gold answers for the 24 seed resumes, the aligner, raise the baseline.
4. **Filters.** Candidate list filters on the new columns and tables; trigram indexes.
5. **Viewer.** Two panes, Text tab, marks, Unassigned, Re-parse. DOCX→PDF on upload.
6. **Ranking and sentence → filter** on top of the existing endpoints, with the structured embedding text.
7. **OCR** for `NeedsOcr` attachments (an `ocrmypdf --force-ocr` sidecar, or a vision model reading page images). Only when the rate of such uploads justifies it.

## Not doing, and why

- **Skill taxonomies (ESCO, Lightcast).** The lookup table with aliases gives exact skill filters without a 13k-entry import that lacks newer tech.
- **Layout engines, section detectors, date regexes.** The model handles layout variation; a page image is the fallback for two-column PDFs that come out interleaved.
- **Local or fine-tuned models, public NER datasets.** Cost at our volume is pennies; the public models' accuracy is self-reported and their training data is weak.
- **Manual correction of parsed data.** See rule 1.
- **A `Resume` history table.** Re-parse overwrites. Add history if a real need shows up.

## Model and cost

Through `Microsoft.Extensions.AI` so the provider is a config change. OpenAI first because the key exists. A two-page resume is ~1.5k input and ~800 output tokens; on `gpt-5-mini` that is roughly $0.002 per resume, so a thousand resumes a year costs about two dollars. Pick on accuracy, not price. Pin the exact model version string in config and keep `PromptVersion` next to it.

## References

- [Microsoft.Extensions.AI structured output](https://learn.microsoft.com/dotnet/ai/quickstarts/structured-output)
- [OpenAI structured outputs](https://cookbook.openai.com/examples/structured_outputs_intro)
- [Why temperature 0 is not deterministic](https://unstract.com/blog/understanding-why-deterministic-output-from-llms-is-nearly-impossible/)
- [Layout-Aware Parsing Meets Efficient LLMs (arXiv 2510.09722)](https://arxiv.org/abs/2510.09722): the line-citation and Hungarian-alignment ideas the verifier and the quality test borrow
- [ResumeBench (EMNLP 2025)](https://aclanthology.org/2025.emnlp-main.1626.pdf): why layout still matters for LLM parsing
- [PdfPig](https://www.github.com/BobLd/PdfPig): word coordinates for the later highlight feature
