using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using FieldCure.DocumentParsers;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>The file has no text layer (scanned, or glyphs drawn as outlines); it needs OCR before it can be parsed.</summary>
public sealed class ResumeNeedsOcrException()
    : Exception("No readable text was found. If this is a scanned PDF, run OCR and try again.");

/// <summary>Step 1 of parsing: the file's text, in document order. Everything after this works on the text alone.</summary>
public sealed partial class ResumeTextExtractor(LocalResumeOcr ocr)
{
    private const int MaxFileBytes = 10 * 1024 * 1024;
    private const int MaxExtractedCharacters = 250_000;

    public async Task<string> ExtractAsync(Stream stream, string fileName, CancellationToken cancellationToken)
    {
        if (!stream.CanRead)
            throw new InvalidDataException("The resume could not be read.");
        if (stream.CanSeek && stream.Length is <= 0 or > MaxFileBytes)
            throw new InvalidDataException("Resumes must be between 1 byte and 10 MB.");

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (extension == ".doc")
            throw new InvalidDataException(
                "Legacy DOC files cannot be parsed. Convert the resume to PDF or DOCX and try again."
            );
        var documentParser = DocumentParserFactory.GetParser(extension)
            ?? throw new InvalidDataException("Only PDF and DOCX resumes can be parsed.");

        using var content = new MemoryStream();
        await stream.CopyToAsync(content, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        var bytes = content.ToArray();
        var text = documentParser.ExtractText(bytes);
        if (string.IsNullOrWhiteSpace(text) && extension == ".docx")
            text = ExtractDocxText(bytes);

        text = NormalizeDocumentText(text);
        if (text.Length < 40 && extension == ".pdf")
        {
            var ocrPdf = await ocr.ProcessAsync(bytes, cancellationToken);
            if (ocrPdf is not null)
                text = NormalizeDocumentText(documentParser.ExtractText(ocrPdf));
        }
        if (text.Length < 40)
            throw new ResumeNeedsOcrException();
        return text.Length > MaxExtractedCharacters ? text[..MaxExtractedCharacters] : text;
    }

    private static string NormalizeDocumentText(string value)
    {
        var normalized = MultiSpaceRegex()
            .Replace(value.Replace('\r', '\n').Replace('\t', ' '), " ")
            .Replace(" \n", "\n");
        var lines = normalized.Split('\n');
        var builder = new StringBuilder(normalized.Length);
        var inMetadata = lines.FirstOrDefault()?.Trim() == "---";
        for (var index = 0; index < lines.Length; index++)
        {
            var line = lines[index].Trim();
            if (inMetadata)
            {
                if (index > 0 && line == "---")
                    inMetadata = false;
                continue;
            }
            line = MarkdownPrefixRegex().Replace(line, string.Empty);
            if (PageHeadingRegex().IsMatch(line) || line.Length == 0)
                continue;
            builder.AppendLine(line);
        }
        return builder.ToString().Trim();
    }

    private static string ExtractDocxText(byte[] bytes)
    {
        using var archive = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
        var document = archive.GetEntry("word/document.xml");
        if (document is null)
            return string.Empty;
        using var stream = document.Open();
        var xml = XDocument.Load(stream);
        return string.Join(
            "\n",
            xml.Descendants().Where(node => node.Name.LocalName == "t").Select(node => node.Value)
        );
    }

    [GeneratedRegex(@"^(?:#{1,6}|[-*+])\s+")]
    private static partial Regex MarkdownPrefixRegex();

    [GeneratedRegex(@"^Page\s+\d+$", RegexOptions.IgnoreCase)]
    private static partial Regex PageHeadingRegex();

    [GeneratedRegex(@"[ ]{2,}")]
    private static partial Regex MultiSpaceRegex();
}
