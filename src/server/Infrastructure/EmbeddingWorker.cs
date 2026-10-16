using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

public static class Similarity
{
    public static float Cosine(float[] a, float[] b)
    {
        if (a.Length != b.Length || a.Length == 0)
            return 0;
        float dot = 0,
            na = 0,
            nb = 0;
        for (var i = 0; i < a.Length; i++)
        {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        return na == 0 || nb == 0 ? 0 : dot / (MathF.Sqrt(na) * MathF.Sqrt(nb));
    }

    // text-embedding-3-small puts related résumé and job text around 0.4–0.7, unrelated near 0.1–0.2;
    // the range is deliberately wide so scores don't saturate at 100 for any plausible candidate.
    public static int ToPercent(float cosine) => (int)Math.Round(Math.Clamp((cosine - 0.2f) / 0.5f, 0f, 1f) * 100);
}

public static class EmbeddingText
{
    public static string ForCandidate(Candidate candidate) =>
        string.Join(
            "\n",
            new[]
            {
                candidate.CurrentTitle,
                candidate.ResumeSummary,
                "Skills: " + string.Join(", ", candidate.ResumeSkills.Concat(candidate.Tags)),
                "Roles: " + string.Join(", ", candidate.ResumeJobTitles),
                "Education: " + string.Join(", ", candidate.ResumeEducation),
                candidate.ResumeText is { Length: > 0 } text ? text[..Math.Min(text.Length, 6000)] : null,
            }.Where(x => !string.IsNullOrWhiteSpace(x))
        );

    public static string ForRequisition(Requisition requisition)
    {
        var text = new StringBuilder(requisition.Title).AppendLine();
        if (!string.IsNullOrWhiteSpace(requisition.RequirementsJson))
            text.AppendLine(requisition.RequirementsJson);
        text.Append(requisition.Description[..Math.Min(requisition.Description.Length, 3000)]);
        return text.ToString();
    }
}

// Keeps résumé and job embeddings current. Resumes arrive by upload, import, parse and review, so one
// sweep that looks for missing or stale vectors covers every path.
public sealed class EmbeddingWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<EmbeddingWorker> logger
) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var more = false;
            try
            {
                more = await SweepAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Embedding sweep failed; will retry.");
            }
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(more ? 1 : 30), stoppingToken);
            }
            catch (OperationCanceledException) { }
        }
    }

    private async Task<bool> SweepAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var ai = scope.ServiceProvider.GetRequiredService<IAiAssistant>();
        if (!ai.IsConfigured)
            return false;
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();

        var requisitions = await db
            .Requisitions.Where(x => x.RequirementsJson != "" && x.RequirementsEmbedding == null)
            .Take(10)
            .ToListAsync(ct);
        foreach (var requisition in requisitions)
            requisition.RequirementsEmbedding = await ai.EmbedAsync(
                EmbeddingText.ForRequisition(requisition),
                ct,
                new AiContext("embed-job", null, "Requisition", requisition.Id.ToString())
            );

        var candidates = await db
            .Candidates.Where(x =>
                x.ResumeText != null
                && (x.ResumeEmbeddingAt == null || x.ResumeEmbeddingAt < x.UpdatedAt)
            )
            .OrderBy(x => x.ResumeEmbeddingAt)
            .Take(20)
            .ToListAsync(ct);
        foreach (var candidate in candidates)
        {
            candidate.ResumeEmbedding = await ai.EmbedAsync(
                EmbeddingText.ForCandidate(candidate),
                ct,
                new AiContext("embed-resume", null, "Candidate", candidate.Id.ToString())
            );
            // Set to UpdatedAt rather than now so a later edit (which moves UpdatedAt forward) re-queues it.
            candidate.ResumeEmbeddingAt = candidate.UpdatedAt;
        }
        await db.SaveChangesAsync(ct);
        return requisitions.Count + candidates.Count > 0;
    }
}
