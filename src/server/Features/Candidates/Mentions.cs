using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>People named with @ in a note. The editor stores each one as <c>[Name](mention:email)</c>.</summary>
public static partial class Mentions
{
    [GeneratedRegex(@"\[[^\]\n]{1,160}\]\(mention:([^)\s]{3,320})\)")]
    private static partial Regex Pattern();

    /// <summary>The emails mentioned in a note's Markdown, lowercased, at most 20.</summary>
    public static string[] Parse(string markdown) =>
        Pattern()
            .Matches(markdown)
            .Select(match =>
                Uri.UnescapeDataString(match.Groups[1].Value).Trim().ToLowerInvariant()
            )
            .Where(email => email.Contains('@'))
            .Distinct()
            .Take(20)
            .ToArray();

    /// <summary>
    /// Keeps a note's mention rows in step with its text: one row per active user named in it (never
    /// the author), and none for names taken out by an edit. Call it after the note is added or changed,
    /// before SaveChanges. Returns the people newly mentioned.
    /// </summary>
    /// <remarks>
    /// The notification feed hooks in here: notify each returned email ("Avery mentioned you in a note
    /// about Jordan Lee", linking to <c>/candidates/{CandidateId}#note-{NoteId}</c>), so an edit never
    /// notifies someone twice.
    /// </remarks>
    public static async Task<string[]> RecordAsync(
        AtsDbContext db,
        ApplicationNote note,
        CancellationToken ct
    )
    {
        var named = Parse(note.Body).Where(email => email != note.AuthorEmail).ToArray();
        var people = await db
            .Users.AsNoTracking()
            .Where(user => user.IsActive && named.Contains(user.Email.ToLower()))
            .Select(user => user.Email.ToLower())
            .ToListAsync(ct);
        var existing = await db.NoteMentions.Where(x => x.NoteId == note.Id).ToListAsync(ct);
        db.NoteMentions.RemoveRange(existing.Where(x => !people.Contains(x.UserEmail)));
        var added = people.Except(existing.Select(x => x.UserEmail)).ToArray();
        foreach (var email in added)
            db.NoteMentions.Add(new NoteMention { NoteId = note.Id, UserEmail = email });
        await Infrastructure.Notify.MentionAsync(db, added, note, ct);
        return added;
    }
}
