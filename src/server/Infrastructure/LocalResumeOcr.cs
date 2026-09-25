using System.Diagnostics;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>Runs the locally installed OCRmyPDF command when OCR is explicitly enabled.</summary>
public sealed class LocalResumeOcr
{
    public async Task<byte[]?> ProcessAsync(byte[] document, CancellationToken cancellationToken)
    {
        var directory = Path.Combine(Path.GetTempPath(), $"ats-ocr-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        var input = Path.Combine(directory, "source.pdf");
        var output = Path.Combine(directory, "ocr.pdf");
        try
        {
            await File.WriteAllBytesAsync(input, document, cancellationToken);
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "ocrmypdf",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                },
            };
            process.StartInfo.ArgumentList.Add("--skip-text");
            process.StartInfo.ArgumentList.Add("--output-type");
            process.StartInfo.ArgumentList.Add("pdf");
            process.StartInfo.ArgumentList.Add(input);
            process.StartInfo.ArgumentList.Add(output);
            process.Start();
            await process.WaitForExitAsync(cancellationToken);
            return process.ExitCode == 0 && File.Exists(output)
                ? await File.ReadAllBytesAsync(output, cancellationToken)
                : null;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return null;
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}
