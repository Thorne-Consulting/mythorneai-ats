using System.IO.Compression;
using Amazon.S3;
using Amazon.S3.Model;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>
/// Where uploaded files live. Without <c>FileStorage:S3:Endpoint</c>, the local folder
/// (<c>FileStorage:RootPath</c>) is the store: a developer machine. With it, the bucket is the
/// only store: uploads stream into it, reads stream out of it, and nothing stays on disk. Tools
/// that need a path (ffmpeg) get a scratch copy in the temp folder, which is removed once the
/// result is uploaded or the stream is closed, and emptied at every start.
/// </summary>
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
    private readonly IAmazonS3? _s3;
    private readonly string _bucket;
    private readonly ILogger<LocalFileStore> _logger;

    public LocalFileStore(
        IConfiguration configuration,
        IHostEnvironment environment,
        ILogger<LocalFileStore> logger
    )
    {
        _logger = logger;
        var endpoint = configuration["FileStorage:S3:Endpoint"];
        // With a bucket, the folder is scratch space in the temp folder (tmpfs in the stack).
        _rootPath = string.IsNullOrWhiteSpace(endpoint)
            ? Path.GetFullPath(
                configuration["FileStorage:RootPath"]
                    ?? Path.Combine(environment.ContentRootPath, "uploads")
            )
            : Path.Combine(Path.GetTempPath(), "ats-scratch");
        if (!string.IsNullOrWhiteSpace(endpoint) && Directory.Exists(_rootPath))
            Directory.Delete(_rootPath, recursive: true);
        Directory.CreateDirectory(_rootPath);
        _bucket = configuration["FileStorage:S3:Bucket"] ?? "ats-files";
        if (!string.IsNullOrWhiteSpace(endpoint))
            _s3 = new AmazonS3Client(
                configuration["FileStorage:S3:AccessKey"],
                configuration["FileStorage:S3:SecretKey"],
                new AmazonS3Config
                {
                    ServiceURL = endpoint,
                    // MinIO and most self-hosted stores address the bucket by path, not by host name.
                    ForcePathStyle = true,
                    AuthenticationRegion = configuration["FileStorage:S3:Region"] ?? "us-east-1",
                }
            );
    }

    /// <summary>True when files also go to a bucket.</summary>
    public bool HasBucket => _s3 is not null;

    /// <summary>Makes the bucket when it is missing. Called once at start; a missing store fails loudly there.</summary>
    public async Task EnsureBucketAsync(CancellationToken ct = default)
    {
        if (_s3 is null)
            return;
        try
        {
            await _s3.GetBucketLocationAsync(_bucket, ct);
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            await _s3.PutBucketAsync(_bucket, ct);
            _logger.LogInformation("Made the file bucket {Bucket}", _bucket);
        }
    }

    /// <summary>
    /// Moves a file that was written to its scratch path (<see cref="FullPath"/>) into the bucket
    /// and removes the scratch copy. Nothing happens without a bucket.
    /// </summary>
    public async Task UploadAsync(string storedName, CancellationToken ct = default)
    {
        if (_s3 is null)
            return;
        var path = SafePath(storedName);
        if (!File.Exists(path))
            return;
        await _s3.PutObjectAsync(
            new PutObjectRequest
            {
                BucketName = _bucket,
                Key = storedName,
                FilePath = path,
            },
            ct
        );
        File.Delete(path);
    }

    private async Task PutAsync(
        string storedName,
        Stream input,
        string contentType,
        CancellationToken ct
    )
    {
        input.Position = 0;
        await _s3!.PutObjectAsync(
            new PutObjectRequest
            {
                BucketName = _bucket,
                Key = storedName,
                InputStream = input,
                AutoCloseStream = false,
                ContentType = contentType,
            },
            ct
        );
    }

    /// <summary>Brings a file from the bucket to the scratch folder when it is not there. Nothing happens without a bucket.</summary>
    private void EnsureLocal(string storedName)
    {
        var path = SafePath(storedName);
        if (_s3 is null || File.Exists(path))
            return;
        try
        {
            // ponytail: synchronous, because FullPath and OpenRead are synchronous for their callers;
            // a miss happens once per file per host.
            using var response = _s3.GetObjectAsync(_bucket, storedName).GetAwaiter().GetResult();
            response
                .WriteResponseStreamToFileAsync(path, false, CancellationToken.None)
                .GetAwaiter()
                .GetResult();
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // Not in the bucket either: the caller sees the usual missing-file result.
        }
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
        var contentType = extension.ToLowerInvariant() switch
        {
            ".pdf" => "application/pdf",
            ".doc" => "application/msword",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            _ => "application/octet-stream",
        };
        if (_s3 is not null)
        {
            await PutAsync(storedName, input, contentType, cancellationToken);
            return (storedName, contentType);
        }
        await using var output = new FileStream(
            SafePath(storedName),
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            64 * 1024,
            FileOptions.Asynchronous
        );
        await input.CopyToAsync(output, cancellationToken);
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
        var contentType = extension == ".webm" ? "video/webm" : "video/mp4";
        if (_s3 is not null)
        {
            await PutAsync(storedName, input, contentType, cancellationToken);
            return (storedName, contentType);
        }
        await using var output = new FileStream(
            SafePath(storedName),
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            64 * 1024,
            FileOptions.Asynchronous
        );
        await input.CopyToAsync(output, cancellationToken);
        return (storedName, contentType);
    }

    public Stream OpenRead(string storedName)
    {
        EnsureLocal(storedName);
        // From a bucket, the scratch copy is unlinked when this stream closes; another reader
        // that still has it open keeps its handle, and a later reader fetches it again.
        var scratch = _s3 is not null ? FileOptions.DeleteOnClose : FileOptions.None;
        return new FileStream(
            SafePath(storedName),
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read | FileShare.Delete,
            64 * 1024,
            FileOptions.Asynchronous | FileOptions.SequentialScan | scratch
        );
    }

    /// <summary>
    /// The file's place on disk, for tools that need a path (ffmpeg) and for writes. The name is
    /// checked. With a bucket this is a scratch copy, fetched first when the bucket has it; call
    /// <see cref="UploadAsync"/> after a write, which also removes the scratch copy.
    /// </summary>
    public string FullPath(string storedName)
    {
        EnsureLocal(storedName);
        return SafePath(storedName);
    }

    /// <summary>Stored files whose names start with <paramref name="prefix"/>.</summary>
    public IEnumerable<FileInfo> Files(string prefix) =>
        new DirectoryInfo(_rootPath).EnumerateFiles(prefix + "*");

    public void Delete(string storedName)
    {
        var path = SafePath(storedName);
        if (File.Exists(path))
            File.Delete(path);
        if (_s3 is not null)
            try
            {
                _s3.DeleteObjectAsync(_bucket, storedName).GetAwaiter().GetResult();
            }
            catch (AmazonS3Exception ex)
            {
                _logger.LogWarning(ex, "Could not delete {Name} from the bucket", storedName);
            }
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
