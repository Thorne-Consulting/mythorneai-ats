using System.IO.Compression;

namespace MyThorneAI.Ats.Api.Infrastructure;

public sealed class LocalFileStore
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase) { ".pdf", ".doc", ".docx" };
    private readonly string _rootPath;

    public LocalFileStore(IConfiguration configuration, IHostEnvironment environment)
    {
        _rootPath = Path.GetFullPath(configuration["FileStorage:RootPath"] ?? Path.Combine(environment.ContentRootPath, "uploads"));
        Directory.CreateDirectory(_rootPath);
    }

    public async Task<(string StoredName, string ContentType)> SaveValidatedAsync(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length is <= 0 or > 10 * 1024 * 1024) throw new InvalidDataException("Files must be between 1 byte and 10 MB.");
        var extension = Path.GetExtension(file.FileName);
        if (!AllowedExtensions.Contains(extension)) throw new InvalidDataException("Only PDF, DOC, and DOCX files are accepted.");

        await using var input = file.OpenReadStream();
        if (!await HasExpectedSignatureAsync(input, extension, cancellationToken)) throw new InvalidDataException("The file content does not match its extension.");
        input.Position = 0;

        var storedName = $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var path = SafePath(storedName);
        await using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 64 * 1024, FileOptions.Asynchronous);
        await input.CopyToAsync(output, cancellationToken);
        return (storedName, "application/octet-stream");
    }

    public Stream OpenRead(string storedName) => new FileStream(SafePath(storedName), FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);

    private string SafePath(string storedName)
    {
        if (storedName != Path.GetFileName(storedName)) throw new InvalidDataException("Invalid stored filename.");
        return Path.Combine(_rootPath, storedName);
    }

    private static async Task<bool> HasExpectedSignatureAsync(Stream stream, string extension, CancellationToken cancellationToken)
    {
        var header = new byte[8];
        var read = await stream.ReadAsync(header, cancellationToken);
        stream.Position = 0;
        if (read < 4) return false;

        if (extension.Equals(".pdf", StringComparison.OrdinalIgnoreCase))
            return header.AsSpan(0, 5).SequenceEqual("%PDF-"u8);

        if (extension.Equals(".doc", StringComparison.OrdinalIgnoreCase))
            return read >= 8 && header.AsSpan().SequenceEqual(new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 });

        if (header[0] != 0x50 || header[1] != 0x4B) return false;
        try
        {
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: true);
            return archive.GetEntry("[Content_Types].xml") is not null && archive.GetEntry("word/document.xml") is not null;
        }
        catch (InvalidDataException)
        {
            return false;
        }
        finally
        {
            stream.Position = 0;
        }
    }
}
