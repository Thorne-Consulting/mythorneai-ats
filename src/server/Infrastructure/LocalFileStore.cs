using System.IO.Compression;

namespace MyThorneAI.Ats.Api.Infrastructure;

public sealed class LocalFileStore
{
    private static readonly HashSet<string> AllowedExtensions = new(
        StringComparer.OrdinalIgnoreCase
    )
    {
        ".pdf",
        ".doc",
        ".docx",
    };

    // Pictures only where a caller asks for them (portfolios, logos); resumes stay documents.
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png",
        ".jpg",
        ".jpeg",
    };
    private readonly string _rootPath;

    public LocalFileStore(IConfiguration configuration, IHostEnvironment environment)
    {
        _rootPath = Path.GetFullPath(
            configuration["FileStorage:RootPath"]
                ?? Path.Combine(environment.ContentRootPath, "uploads")
        );
        Directory.CreateDirectory(_rootPath);
    }

    public async Task<(string StoredName, string ContentType)> SaveValidatedAsync(
        IFormFile file,
        CancellationToken cancellationToken,
        bool allowImages = false
    )
    {
        await using var input = file.OpenReadStream();
        return await SaveValidatedAsync(
            input,
            file.FileName,
            file.Length,
            cancellationToken,
            allowImages
        );
    }

    public static bool IsImage(string fileName) =>
        ImageExtensions.Contains(Path.GetExtension(fileName));

    public async Task<(string StoredName, string ContentType)> SaveValidatedAsync(
        Stream input,
        string fileName,
        long length,
        CancellationToken cancellationToken,
        bool allowImages = false
    )
    {
        if (length is <= 0 or > 10 * 1024 * 1024)
            throw new InvalidDataException("Files must be between 1 byte and 10 MB.");
        if (!input.CanSeek)
            throw new InvalidDataException("The file stream must support seeking.");
        var extension = Path.GetExtension(fileName);
        var image = allowImages && ImageExtensions.Contains(extension);
        if (!AllowedExtensions.Contains(extension) && !image)
            throw new InvalidDataException(
                allowImages
                    ? "Only PDF, Word (DOC or DOCX), PNG and JPEG files are accepted."
                    : "Only PDF, DOC, and DOCX files are accepted."
            );

        if (!await HasExpectedSignatureAsync(input, extension, cancellationToken))
            throw new InvalidDataException("The file content does not match its extension.");
        input.Position = 0;

        var storedName = $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var path = SafePath(storedName);
        await using var output = new FileStream(
            path,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            64 * 1024,
            FileOptions.Asynchronous
        );
        await input.CopyToAsync(output, cancellationToken);
        var contentType = extension.ToLowerInvariant() switch
        {
            ".pdf" => "application/pdf",
            ".doc" => "application/msword",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            _ => "application/octet-stream",
        };
        return (storedName, contentType);
    }

    public async Task<(string StoredName, string ContentType)> SaveRecordingAsync(
        IFormFile file,
        CancellationToken cancellationToken
    )
    {
        if (file.Length is <= 0 or > 1024L * 1024 * 1024)
            throw new InvalidDataException("Recordings must be between 1 byte and 1 GB.");
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (extension is not ".webm" and not ".mp4")
            throw new InvalidDataException("Only WebM and MP4 recordings are accepted.");
        await using var input = file.OpenReadStream();
        var header = new byte[12];
        var read = await input.ReadAsync(header, cancellationToken);
        var valid =
            extension == ".webm"
                ? read >= 4
                    && header.AsSpan(0, 4).SequenceEqual(new byte[] { 0x1A, 0x45, 0xDF, 0xA3 })
                : read >= 12 && header.AsSpan(4, 4).SequenceEqual("ftyp"u8);
        if (!valid)
            throw new InvalidDataException("The recording content does not match its extension.");
        input.Position = 0;
        var storedName = $"{Guid.NewGuid():N}{extension}";
        await using var output = new FileStream(
            SafePath(storedName),
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            64 * 1024,
            FileOptions.Asynchronous
        );
        await input.CopyToAsync(output, cancellationToken);
        return (storedName, extension == ".webm" ? "video/webm" : "video/mp4");
    }

    public Stream OpenRead(string storedName) =>
        new FileStream(
            SafePath(storedName),
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            64 * 1024,
            FileOptions.Asynchronous | FileOptions.SequentialScan
        );

    /// <summary>The file's place on disk, for tools that need a path (ffmpeg). The name is checked.</summary>
    public string FullPath(string storedName) => SafePath(storedName);

    /// <summary>Stored files whose names start with <paramref name="prefix"/>.</summary>
    public IEnumerable<FileInfo> Files(string prefix) =>
        new DirectoryInfo(_rootPath).EnumerateFiles(prefix + "*");

    public void Delete(string storedName)
    {
        var path = SafePath(storedName);
        if (File.Exists(path))
            File.Delete(path);
    }

    private string SafePath(string storedName)
    {
        if (storedName != Path.GetFileName(storedName))
            throw new InvalidDataException("Invalid stored filename.");
        return Path.Combine(_rootPath, storedName);
    }

    private static async Task<bool> HasExpectedSignatureAsync(
        Stream stream,
        string extension,
        CancellationToken cancellationToken
    )
    {
        var header = new byte[8];
        var read = await stream.ReadAsync(header, cancellationToken);
        stream.Position = 0;
        if (read < 4)
            return false;

        if (extension.Equals(".pdf", StringComparison.OrdinalIgnoreCase))
            return header.AsSpan(0, 5).SequenceEqual("%PDF-"u8);

        if (extension.Equals(".png", StringComparison.OrdinalIgnoreCase))
            return read >= 8
                && header
                    .AsSpan()
                    .SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A });

        if (
            extension.Equals(".jpg", StringComparison.OrdinalIgnoreCase)
            || extension.Equals(".jpeg", StringComparison.OrdinalIgnoreCase)
        )
            return header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF;

        if (extension.Equals(".doc", StringComparison.OrdinalIgnoreCase))
            return read >= 8
                && header
                    .AsSpan()
                    .SequenceEqual(new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 });

        if (header[0] != 0x50 || header[1] != 0x4B)
            return false;
        try
        {
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: true);
            return archive.GetEntry("[Content_Types].xml") is not null
                && archive.GetEntry("word/document.xml") is not null;
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
