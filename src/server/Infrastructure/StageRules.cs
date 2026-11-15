using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>
/// What stages mean. Everything that used to look a stage up by its name (booking, hiring, colours,
/// candidate emails, dashboards) asks here, by type.
/// </summary>
public static partial class StageRules
{
    public static readonly string[] Tones = ["blue", "violet", "green", "amber", "red", "gray"];

    /// <summary>The stage's colour: its stored tone when set, else its type's. The web app mirrors this in components/status.tsx.</summary>
    public static string Tone(StageType type, string? color = null) =>
        color is not null && Tones.Contains(color)
            ? color
            : type switch
            {
                StageType.Screen => "violet",
                StageType.Interview => "blue",
                StageType.Offer => "amber",
                StageType.Hired => "green",
                _ => "gray",
            };

    public static string DefaultLabel(StageType type) =>
        type switch
        {
            StageType.Applied => "Application received",
            StageType.Screen => "Under review",
            StageType.Interview => "Interviewing",
            StageType.Offer => "Offer",
            StageType.Hired => "Hired",
            _ => "In progress",
        };

    /// <summary>What candidates see for a stage. Never the internal name.</summary>
    public static string CandidateLabel(PipelineStage stage) =>
        string.IsNullOrWhiteSpace(stage.CandidateLabel)
            ? DefaultLabel(stage.Type)
            : stage.CandidateLabel;

    /// <summary>The job's Hired stage: the Hired-type stage, else the last terminal one.</summary>
    public static PipelineStage? Hired(IEnumerable<PipelineStage> stages)
    {
        var ordered = stages.OrderBy(x => x.SortOrder).ToList();
        return ordered.LastOrDefault(x => x.Type == StageType.Hired)
            ?? ordered.LastOrDefault(x => x.IsTerminal);
    }

    public static PipelineStage? FirstInterview(IEnumerable<PipelineStage> stages) =>
        stages.Where(x => x.Type == StageType.Interview).OrderBy(x => x.SortOrder).FirstOrDefault();

    /// <summary>
    /// Where booking an interview takes someone: the first interview stage after the one they are in.
    /// Null when there is none (they are already at the last interview stage, or past interviews).
    /// </summary>
    public static PipelineStage? NextInterview(
        IEnumerable<PipelineStage> stages,
        Guid currentStageId
    )
    {
        var list = stages.ToList();
        var after = list.FirstOrDefault(x => x.Id == currentStageId)?.SortOrder ?? -1;
        return list.Where(x => x.Type == StageType.Interview && x.SortOrder > after)
            .OrderBy(x => x.SortOrder)
            .FirstOrDefault();
    }

    /// <summary>A type for a stage known only by its name, for rows from before stage types.</summary>
    public static StageType Guess(string name, bool isTerminal, int sortOrder)
    {
        if (isTerminal)
            return StageType.Hired;
        var n = name.Trim().ToLowerInvariant();
        if (n.Contains("offer"))
            return StageType.Offer;
        if (InterviewWords().IsMatch(n))
            return StageType.Interview;
        if (ScreenWords().IsMatch(n))
            return StageType.Screen;
        if (sortOrder == 0 || AppliedWords().IsMatch(n))
            return StageType.Applied;
        return StageType.Other;
    }

    [GeneratedRegex("interview|technical|panel|onsite|on-site|final|booked|schedul")]
    private static partial Regex InterviewWords();

    [GeneratedRegex("screen|phone|review|assess|qualif")]
    private static partial Regex ScreenWords();

    [GeneratedRegex(@"\bnew\b|appl|inbox|sourc|lead")]
    private static partial Regex AppliedWords();

    // The old default names, which read like internal jargon.
    private static string Rename(string name) =>
        name.Trim().ToLowerInvariant() switch
        {
            "booked" => "Interview scheduled",
            "offer handoff" => "Offer",
            _ => name,
        };

    private static PipelineTemplateStage TemplateStage(string name, StageType type, string label) =>
        new()
        {
            Name = name,
            Type = type,
            CandidateLabel = label,
        };

    /// <summary>The stages a job gets when there is no pipeline to copy (Hired comes after them).</summary>
    public static List<PipelineTemplateStage> DefaultTemplate() =>
        Ordered([
            TemplateStage("New", StageType.Applied, "Application received"),
            TemplateStage("Review", StageType.Screen, "Under review"),
            TemplateStage("Interview", StageType.Interview, "Interviewing"),
            TemplateStage("Interview scheduled", StageType.Interview, "Interview scheduled"),
            TemplateStage("Offer", StageType.Offer, "Offer"),
        ]);

    public static List<PipelineTemplateStage> EngineeringTemplate() =>
        Ordered([
            TemplateStage("New", StageType.Applied, "Application received"),
            TemplateStage("Review", StageType.Screen, "Under review"),
            TemplateStage("Recruiter screen", StageType.Screen, "Under review"),
            TemplateStage("Technical screen", StageType.Interview, "Interviewing"),
            TemplateStage("Panel interview", StageType.Interview, "Interviewing"),
            TemplateStage("Offer", StageType.Offer, "Offer"),
        ]);

    private static List<PipelineTemplateStage> Ordered(List<PipelineTemplateStage> stages)
    {
        for (var i = 0; i < stages.Count; i++)
            stages[i].SortOrder = i;
        return stages;
    }

    public static PipelineStage HiredStage(Guid requisitionId, int sortOrder) =>
        new()
        {
            RequisitionId = requisitionId,
            Name = "Hired",
            SortOrder = sortOrder,
            Type = StageType.Hired,
            CandidateLabel = DefaultLabel(StageType.Hired),
            IsTerminal = true,
        };

    /// <summary>A job's stages from a pipeline's, then Hired.</summary>
    public static List<PipelineStage> FromTemplate(
        Guid requisitionId,
        IEnumerable<PipelineTemplateStage> template
    )
    {
        var stages = template
            .Where(x => x.Type != StageType.Hired)
            .OrderBy(x => x.SortOrder)
            .Select(
                (x, index) =>
                    new PipelineStage
                    {
                        RequisitionId = requisitionId,
                        Name = x.Name,
                        SortOrder = index,
                        Type = x.Type,
                        CandidateLabel = x.CandidateLabel,
                        EmailOnEntry = x.EmailOnEntry,
                        TargetDays = x.TargetDays,
                        AssessmentId = x.AssessmentId,
                    }
            )
            .ToList();
        stages.Add(HiredStage(requisitionId, stages.Count));
        return stages;
    }

    /// <summary>
    /// Gives stages and pipelines from before stage types a type, a candidate label and a readable
    /// name. Runs at startup; rows already done are skipped, so it is safe to run every time.
    /// </summary>
    public static async Task BackfillAsync(AtsDbContext db, CancellationToken ct = default)
    {
        // Projected, so the new columns' placeholder values are never read.
        var rows = await db
            .PipelineStages.Where(x => x.CandidateLabel == "")
            .Select(x => new
            {
                x.Id,
                x.Name,
                x.IsTerminal,
                x.SortOrder,
            })
            .ToListAsync(ct);
        foreach (
            var group in rows.GroupBy(x =>
            {
                var type = Guess(x.Name, x.IsTerminal, x.SortOrder);
                return (Type: type, Name: Rename(x.Name), Label: DefaultLabel(type));
            })
        )
        {
            var ids = group.Select(x => x.Id).ToArray();
            await db
                .PipelineStages.Where(x => ids.Contains(x.Id))
                .ExecuteUpdateAsync(
                    set =>
                        set.SetProperty(x => x.Type, group.Key.Type)
                            .SetProperty(x => x.Name, group.Key.Name)
                            .SetProperty(x => x.CandidateLabel, group.Key.Label)
                            .SetProperty(x => x.IsTerminal, group.Key.Type == StageType.Hired)
                            .SetProperty(x => x.EmailOnEntry, StageEmail.Off)
                            // The old colours were handed out in turn ("indigo", "grape"), never chosen.
                            .SetProperty(x => x.Color, (string?)null),
                    ct
                );
        }

        var templates = await db
            .PipelineTemplates.Include(x => x.Stages)
            .Where(x => x.StageNames.Length > 0 && !x.Stages.Any())
            .ToListAsync(ct);
        foreach (var template in templates)
        {
            // Added through the set: a new row with its key already set, attached through a tracked
            // parent's list, would be saved as an update.
            if (template.Stages.Count == 0)
                db.PipelineTemplateStages.AddRange(
                    Ordered(
                        template
                            .StageNames.Where(x =>
                                !x.Equals("Hired", StringComparison.OrdinalIgnoreCase)
                            )
                            .Select(
                                (name, index) =>
                                {
                                    var type = Guess(name, false, index);
                                    var stage = TemplateStage(
                                        Rename(name),
                                        type,
                                        DefaultLabel(type)
                                    );
                                    stage.PipelineTemplateId = template.Id;
                                    return stage;
                                }
                            )
                            .ToList()
                    )
                );
        }
        if (templates.Count > 0)
            await db.SaveChangesAsync(ct);
    }
}
