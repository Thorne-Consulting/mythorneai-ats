using System.Diagnostics;
using FFMpegCore;
using FFMpegCore.Enums;

namespace MyThorneAI.Ats.Api.Interviews.Recording;

/// <summary>
/// ffmpeg, when the server has it: seekable recordings, a small audio file for transcription, and
/// pieces for long audio. Everything here is optional; without ffmpeg the original file is used.
/// </summary>
public sealed class MediaTools(ILogger<MediaTools> logger)
{
    private bool? available;

    /// <summary>Checked once, on first use: "ffmpeg -version" runs.</summary>
    public bool Available => available ??= Detect();

    private bool Detect()
    {
        try
        {
            using var process = Process.Start(
                new ProcessStartInfo(GlobalFFOptions.GetFFMpegBinaryPath(), "-version")
                {
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                }
            );
            if (process is null || !process.WaitForExit(5000))
                return false;
            return process.ExitCode == 0;
        }
        catch (Exception exception)
        {
            logger.LogInformation(
                "ffmpeg is not installed ({Message}). Recordings are kept as uploaded.",
                exception.Message
            );
            return false;
        }
    }

    /// <summary>Rewrites the container with a duration and seek index (no re-encoding).</summary>
    public Task<bool> RemuxAsync(string input, string output, CancellationToken ct) =>
        FFMpegArguments
            .FromFileInput(input)
            .OutputToFile(
                output,
                true,
                options =>
                {
                    options.CopyChannel(Channel.Both);
                    if (output.EndsWith(".mp4") || output.EndsWith(".m4a"))
                        options.WithFastStart();
                }
            )
            .CancellableThrough(ct)
            .ProcessAsynchronously();

    /// <summary>16 kHz mono Opus at 24 kbit/s: about 11 MB an hour, plenty for speech.</summary>
    public Task<bool> ExtractAudioAsync(string input, string output, CancellationToken ct) =>
        FFMpegArguments
            .FromFileInput(input)
            .OutputToFile(
                output,
                true,
                options =>
                    options
                        .DisableChannel(Channel.Video)
                        .WithAudioCodec("libopus")
                        .WithAudioBitrate(24)
                        .WithAudioSamplingRate(16000)
                        .WithCustomArgument("-ac 1")
            )
            .CancellableThrough(ct)
            .ProcessAsynchronously();

    /// <summary>Cuts audio into pieces of <paramref name="seconds"/> each; returns them in order.</summary>
    public async Task<IReadOnlyList<string>> SplitAsync(
        string input,
        string folder,
        int seconds,
        CancellationToken ct
    )
    {
        Directory.CreateDirectory(folder);
        var extension = Path.GetExtension(input);
        await FFMpegArguments
            .FromFileInput(input)
            .OutputToFile(
                Path.Combine(folder, $"part%03d{extension}"),
                true,
                options =>
                    options
                        .CopyChannel(Channel.Audio)
                        .WithCustomArgument(
                            $"-f segment -segment_time {seconds} -reset_timestamps 1"
                        )
            )
            .CancellableThrough(ct)
            .ProcessAsynchronously();
        return Directory.GetFiles(folder, $"part*{extension}").Order().ToList();
    }

    public async Task<int?> DurationSecondsAsync(string path, CancellationToken ct)
    {
        try
        {
            var analysis = await FFProbe.AnalyseAsync(path, cancellationToken: ct);
            return (int)Math.Round(analysis.Duration.TotalSeconds);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Could not read the length of {Path}.", path);
            return null;
        }
    }
}
