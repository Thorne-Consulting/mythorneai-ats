using System.Net;
using System.Security.Claims;
using System.Text.RegularExpressions;
using EmailReplyParser;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>An email someone sent to one of our reply addresses, already fetched from the provider.</summary>
public sealed record InboundEmail(
    string ExternalId,
    string From,
    IReadOnlyList<string> To,
    string Subject,
    string? Text,
    string? Html,
    string? InReplyTo = null,
    string? References = null,
    IReadOnlyList<InboundFile>? Files = null
);

public sealed record InboundFile(
    string FileName,
    long Size,
    bool Inline,
    Func<CancellationToken, Task<Stream>> OpenAsync
);

public enum InboundOutcome
{
    Duplicate,
    Posted,
    Unmatched,
}

public sealed record InboundResult(
    InboundOutcome Outcome,
    Guid? ApplicationId = null,
    Guid? CandidateId = null
);

/// <summary>
/// Turns an emailed reply into a thread message. Matching order: the token in the reply address,
/// then the thread reference in the reply headers, then the sender's address when it belongs to
/// exactly one candidate with an open application. Anything else waits in the Unmatched list.
/// </summary>
public static partial class EmailInbound
{
    public const int MaxBody = 10_000;

    public static async Task<InboundResult> ReceiveAsync(
        AtsDbContext db,
        IConfiguration configuration,
        LocalFileStore store,
        InboundEmail email,
        CancellationToken ct
    )
    {
        if (
            await db.ApplicationMessages.AnyAsync(x => x.ExternalMessageId == email.ExternalId, ct)
            || await db.UnmatchedInboundEmails.AnyAsync(
                x => x.ExternalMessageId == email.ExternalId,
                ct
            )
        )
            return new(InboundOutcome.Duplicate);

        var (fromAddress, fromName) = ParseAddress(email.From);
        var full = PlainText(email.Text, email.Html);
        var visible = VisibleText(full);
        var (application, staffEmail) = await MatchAsync(db, email, fromAddress, ct);

        // A team reply only counts when it comes from the person the reply address was made for.
        if (
            application is not null
            && staffEmail is not null
            && !await StaffMayReplyAsync(db, application, staffEmail, fromAddress, ct)
        )
            application = null;
        if (application is null || visible.Length == 0)
        {
            db.UnmatchedInboundEmails.Add(
                new UnmatchedInboundEmail
                {
                    ExternalMessageId = email.ExternalId,
                    FromAddress = fromAddress,
                    FromName = fromName,
                    Subject = Clip(email.Subject, 500),
                    Body = Clip(full, MaxBody),
                }
            );
            await db.SaveChangesAsync(ct);
            return new(InboundOutcome.Unmatched);
        }

        var message = new ApplicationMessage
        {
            ApplicationId = application.Id,
            FromCandidate = staffEmail is null,
            AuthorEmail = staffEmail,
            Body = Clip(visible, MaxBody),
            OriginalBody = full.Trim() == visible ? null : Clip(full, 50_000),
            Channel = MessageChannel.Email,
            ExternalMessageId = email.ExternalId,
            // Never assume another address is the candidate: label it.
            FromAddress =
                staffEmail is null
                && !fromAddress.Equals(
                    application.Candidate!.Email,
                    StringComparison.OrdinalIgnoreCase
                )
                    ? fromAddress
                    : null,
        };
        var saved = await SaveFilesAsync(
            store,
            application,
            message,
            email.Files ?? [],
            staffEmail ?? fromAddress,
            ct
        );
        db.ApplicationMessages.Add(message);
        db.Attachments.AddRange(saved.Kept);
        if (saved.Skipped.Count > 0)
            message.Body = Clip(
                $"{message.Body}\n\n(Files we could not keep: {string.Join(", ", saved.Skipped)}. Only PDF and Word files are saved.)",
                MaxBody
            );
        application.LastActivityAt = DateTimeOffset.UtcNow;

        if (staffEmail is null)
        {
            // A candidate writing again reopens a thread the team marked done.
            application.ThreadDoneAt = null;
            await EmailThreads.AlertTeamAsync(db, configuration, application, message, ct);
        }
        else
        {
            var state = await EmailThreads.StateAsync(db, application.Id, staffEmail, ct);
            state.LastReadAt = DateTimeOffset.UtcNow;
            state.MarkedUnread = false;
            if (
                application.Status != ApplicationStatus.PendingVerification
                && !application.Candidate!.DoNotContact
            )
                await EmailThreads.QueueCandidateCopyAsync(
                    db,
                    configuration,
                    application,
                    message,
                    saved.Kept,
                    ct
                );
        }
        await db.SaveChangesAsync(ct);
        return new(InboundOutcome.Posted, application.Id, application.CandidateId);
    }

    /// <summary>Post an unmatched email into a thread as the candidate's, then forget it.</summary>
    public static async Task<ApplicationMessage> AttachUnmatchedAsync(
        AtsDbContext db,
        UnmatchedInboundEmail email,
        Application application,
        CancellationToken ct
    )
    {
        var message = new ApplicationMessage
        {
            ApplicationId = application.Id,
            FromCandidate = true,
            Body = Clip(
                VisibleText(email.Body) is { Length: > 0 } visible ? visible : email.Body,
                MaxBody
            ),
            OriginalBody = email.Body,
            Channel = MessageChannel.Email,
            ExternalMessageId = email.ExternalMessageId,
            CreatedAt = email.ReceivedAt,
            FromAddress = email.FromAddress.Equals(
                application.Candidate!.Email,
                StringComparison.OrdinalIgnoreCase
            )
                ? null
                : email.FromAddress,
        };
        db.ApplicationMessages.Add(message);
        db.UnmatchedInboundEmails.Remove(email);
        application.ThreadDoneAt = null;
        application.LastActivityAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return message;
    }

    private static IQueryable<Application> Threads(AtsDbContext db) =>
        db.Applications.Include(x => x.Candidate).Include(x => x.Requisition);

    private static async Task<(Application? Application, string? StaffEmail)> MatchAsync(
        AtsDbContext db,
        InboundEmail email,
        string fromAddress,
        CancellationToken ct
    )
    {
        var tokens = email
            .To.SelectMany(to => ReplyToken().Matches(to))
            .Select(m => m.Groups[1].Value.ToLowerInvariant())
            .Concat(
                ThreadReference()
                    .Matches($"{email.InReplyTo} {email.References}")
                    .Select(m => m.Groups[2].Value.ToLowerInvariant())
            )
            .Distinct()
            .ToList();
        foreach (var token in tokens)
        {
            if (
                await Threads(db).SingleOrDefaultAsync(x => x.ThreadToken == token, ct) is
                { } application
            )
                return (application, null);
            var state = await db
                .MessageThreadStates.AsNoTracking()
                .SingleOrDefaultAsync(x => x.ReplyToken == token, ct);
            if (
                state is not null
                && await Threads(db).SingleOrDefaultAsync(x => x.Id == state.ApplicationId, ct)
                    is { } staffThread
            )
                return (staffThread, state.UserEmail);
        }
        var open = await Threads(db)
            .Where(x =>
                x.Candidate!.Email.ToLower() == fromAddress && x.Status == ApplicationStatus.Active
            )
            .Take(2)
            .ToListAsync(ct);
        return (open.Count == 1 ? open[0] : null, null);
    }

    private static async Task<bool> StaffMayReplyAsync(
        AtsDbContext db,
        Application application,
        string staffEmail,
        string fromAddress,
        CancellationToken ct
    )
    {
        if (!staffEmail.Equals(fromAddress, StringComparison.OrdinalIgnoreCase))
            return false;
        var user = await db
            .Users.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Email == staffEmail && x.IsActive, ct);
        if (user is null)
            return false;
        var principal = new ClaimsPrincipal(
            new ClaimsIdentity(
                [
                    new Claim(ClaimTypes.Email, user.Email),
                    new Claim(ClaimTypes.Role, user.Role.ToString()),
                ],
                "email-reply"
            )
        );
        return AtsEndpoints.CanManage(application.Requisition!, principal);
    }

    private static async Task<(List<Attachment> Kept, List<string> Skipped)> SaveFilesAsync(
        LocalFileStore store,
        Application application,
        ApplicationMessage message,
        IReadOnlyList<InboundFile> files,
        string uploadedBy,
        CancellationToken ct
    )
    {
        var kept = new List<Attachment>();
        var skipped = new List<string>();
        // Inline images are signatures and logos, not files anyone sent on purpose.
        foreach (var file in files.Where(x => !x.Inline).Take(10))
        {
            try
            {
                await using var source = await file.OpenAsync(ct);
                using var buffer = new MemoryStream();
                await source.CopyToAsync(buffer, ct);
                buffer.Position = 0;
                var stored = await store.SaveValidatedAsync(
                    buffer,
                    file.FileName,
                    buffer.Length,
                    ct
                );
                kept.Add(
                    new Attachment
                    {
                        CandidateId = application.CandidateId,
                        OriginalFileName = Clip(Path.GetFileName(file.FileName), 255),
                        StoredFileName = stored.StoredName,
                        ContentType = stored.ContentType,
                        Length = buffer.Length,
                        UploadedBy = uploadedBy,
                        ScanStatus = "ValidationOnly",
                        Kind = AttachmentKinds.Other,
                        MessageId = message.Id,
                    }
                );
            }
            catch (Exception exception)
                when (exception is InvalidDataException or HttpRequestException or IOException)
            {
                skipped.Add(Path.GetFileName(file.FileName));
            }
        }
        return (kept, skipped);
    }

    /// <summary>"Karen Dela Cruz &lt;Karen@Example.com&gt;" becomes ("karen@example.com", "Karen Dela Cruz").</summary>
    public static (string Address, string? Name) ParseAddress(string from)
    {
        var start = from.LastIndexOf('<');
        if (start < 0)
            return (from.Trim().ToLowerInvariant(), null);
        var address = from[(start + 1)..].TrimEnd('>', ' ').Trim().ToLowerInvariant();
        var name = from[..start].Trim().Trim('"').Trim();
        return (address, name.Length == 0 ? null : name);
    }

    /// <summary>The plain-text part, or the HTML part reduced to text when that is all there is.</summary>
    public static string PlainText(string? text, string? html)
    {
        if (!string.IsNullOrWhiteSpace(text))
            return text.Replace("\r\n", "\n").Trim();
        if (string.IsNullOrWhiteSpace(html))
            return "";
        var withBreaks = LineBreakTags().Replace(HiddenBlocks().Replace(html, ""), "\n");
        var withoutQuotes = BlockquoteTag()
            .Replace(
                withBreaks,
                m => "\n" + string.Join("\n", m.Value.Split('\n').Select(l => "> " + l))
            );
        var stripped = WebUtility.HtmlDecode(AnyTag().Replace(withoutQuotes, ""));
        return BlankLines().Replace(stripped.Replace("\r\n", "\n"), "\n\n").Trim();
    }

    /// <summary>The new part of a reply: quoted history and signatures cut off.</summary>
    public static string VisibleText(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return "";
        var visible = EmailParser.Parse(text).GetVisibleText().Trim();
        return visible.Length > 0 ? visible : text.Trim();
    }

    private static string Clip(string value, int max) => value.Length <= max ? value : value[..max];

    [GeneratedRegex(@"reply\+([a-z0-9]{8,40})@", RegexOptions.IgnoreCase)]
    private static partial Regex ReplyToken();

    [GeneratedRegex(@"<(thread|team)-([a-z0-9]{8,40})@", RegexOptions.IgnoreCase)]
    private static partial Regex ThreadReference();

    [GeneratedRegex(@"<\s*(br|/p|/div|/li|/tr|/h[1-6])\s*/?>", RegexOptions.IgnoreCase)]
    private static partial Regex LineBreakTags();

    [GeneratedRegex(@"<blockquote[\s\S]*?</blockquote>", RegexOptions.IgnoreCase)]
    private static partial Regex BlockquoteTag();

    [GeneratedRegex(@"<(style|head|script)[\s\S]*?</\1>", RegexOptions.IgnoreCase)]
    private static partial Regex HiddenBlocks();

    [GeneratedRegex(@"<[^>]+>")]
    private static partial Regex AnyTag();

    [GeneratedRegex(@"\n{3,}")]
    private static partial Regex BlankLines();
}
