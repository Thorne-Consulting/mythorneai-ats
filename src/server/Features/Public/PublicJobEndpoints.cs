using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class PublicEndpoints
{
    private static void MapPublicJobs(RouteGroupBuilder api)
    {
        api.MapGet("/jobs/{id:guid}", async (Guid id, AtsDbContext db, CancellationToken ct) =>
        {
            var job = await db.Requisitions.AsNoTracking()
                .Where(x => x.Id == id && x.Status == RequisitionStatus.Open)
                .Select(x => new { x.Id, x.Code, x.Title, x.Department, x.Location, x.EmploymentType,
                    x.WorkMode, x.Openings, x.Description, x.ApplicationQuestionsMarkdown, x.TargetStartDate })
                .SingleOrDefaultAsync(ct);
            return job is null ? Results.NotFound() : Results.Ok(job);
        });

        api.MapPost("/jobs/{id:guid}/applications", async (
            Guid id, PublicApplyRequest request, AtsDbContext db, IEmailSender email, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.FirstName) || string.IsNullOrWhiteSpace(request.LastName) || !LooksLikeEmail(request.Email))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["application"] = ["First name, last name, and a valid email are required."] });
            var job = await db.Requisitions.Include(x => x.Stages).SingleOrDefaultAsync(x => x.Id == id && x.Status == RequisitionStatus.Open, ct);
            if (job is null) return Results.NotFound();
            var emailAddress = request.Email.Trim().ToLowerInvariant();
            var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Email == emailAddress, ct);
            if (candidate is not null && await db.Applications.AnyAsync(x => x.CandidateId == candidate.Id && x.RequisitionId == id && x.Status != ApplicationStatus.PendingVerification, ct))
                return Results.Accepted(value: new { message = "Check your email for a confirmation code." });
            if (candidate is null)
            {
                candidate = new Candidate { FirstName = request.FirstName.Trim(), LastName = request.LastName.Trim(), Email = emailAddress, Source = "Career site", Phone = Clean(request.Phone), Location = Clean(request.Location), LinkedInUrl = Clean(request.LinkedInUrl) };
                db.Candidates.Add(candidate);
            }
            else
            {
                candidate.FirstName = request.FirstName.Trim(); candidate.LastName = request.LastName.Trim();
                candidate.Phone = Clean(request.Phone) ?? candidate.Phone; candidate.Location = Clean(request.Location) ?? candidate.Location;
                candidate.LinkedInUrl = Clean(request.LinkedInUrl) ?? candidate.LinkedInUrl; candidate.UpdatedAt = DateTimeOffset.UtcNow;
            }
            var application = await db.Applications.SingleOrDefaultAsync(x => x.CandidateId == candidate.Id && x.RequisitionId == id && x.Status == ApplicationStatus.PendingVerification, ct);
            if (application is null)
            {
                application = new Application { Candidate = candidate, RequisitionId = id, PipelineStageId = job.Stages.OrderBy(x => x.SortOrder).First().Id, Source = "Career site", Status = ApplicationStatus.PendingVerification };
                db.Applications.Add(application);
            }
            application.ApplicationAnswersMarkdown = Clean(request.AnswersMarkdown) ?? application.ApplicationAnswersMarkdown;
            return await SaveVerificationAsync(application, emailAddress, job.Title, db, email, ct);
        });

        api.MapPost("/jobs/{id:guid}/applications/resume", async (
            Guid id, HttpRequest request, AtsDbContext db, LocalFileStore files, IEmailSender email, CancellationToken ct) =>
        {
            var form = await request.ReadFormAsync(ct);
            var firstName = form["firstName"].ToString().Trim(); var lastName = form["lastName"].ToString().Trim();
            var emailAddress = form["email"].ToString().Trim().ToLowerInvariant(); var file = form.Files.GetFile("resume");
            if (firstName.Length == 0 || lastName.Length == 0 || !LooksLikeEmail(emailAddress) || file is null)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["application"] = ["First name, last name, email, and a resume are required."] });
            var job = await db.Requisitions.Include(x => x.Stages).SingleOrDefaultAsync(x => x.Id == id && x.Status == RequisitionStatus.Open, ct);
            if (job is null) return Results.NotFound();
            var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Email == emailAddress, ct);
            if (candidate is not null && await db.Applications.AnyAsync(x => x.CandidateId == candidate.Id && x.RequisitionId == id && x.Status != ApplicationStatus.PendingVerification, ct))
                return Results.Accepted(value: new { message = "Check your email for a confirmation code." });
            var isNewCandidate = candidate is null;
            candidate ??= new Candidate { FirstName = firstName, LastName = lastName, Email = emailAddress, Source = "Career site", Phone = Clean(form["phone"]), Location = Clean(form["location"]), LinkedInUrl = Clean(form["linkedInUrl"]) };
            candidate.FirstName = firstName; candidate.LastName = lastName; candidate.UpdatedAt = DateTimeOffset.UtcNow;
            if (isNewCandidate) db.Candidates.Add(candidate);
            var application = await db.Applications.SingleOrDefaultAsync(x => x.CandidateId == candidate.Id && x.RequisitionId == id && x.Status == ApplicationStatus.PendingVerification, ct);
            if (application is null)
            {
                application = new Application { Candidate = candidate, RequisitionId = id, PipelineStageId = job.Stages.OrderBy(x => x.SortOrder).First().Id, Source = "Career site", Status = ApplicationStatus.PendingVerification };
                db.Applications.Add(application);
            }
            application.ApplicationAnswersMarkdown = Clean(form["answersMarkdown"]) ?? application.ApplicationAnswersMarkdown;
            (string StoredName, string ContentType) stored;
            try { stored = await files.SaveValidatedAsync(file, ct); }
            catch (InvalidDataException exception) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["resume"] = [exception.Message] }); }
            var attachment = new Attachment { Candidate = candidate, OriginalFileName = Path.GetFileName(file.FileName), StoredFileName = stored.StoredName, ContentType = stored.ContentType, Length = file.Length, UploadedBy = $"candidate:{emailAddress}", ScanStatus = "ValidationOnly", ParseStatus = "Pending" };
            db.Attachments.Add(attachment); db.ResumeParseJobs.Add(new ResumeParseJob { AttachmentId = attachment.Id });
            try
            {
                var result = await SaveVerificationAsync(application, emailAddress, job.Title, db, email, ct);
                return result;
            }
            catch { files.Delete(stored.StoredName); throw; }
        });
    }

    private static async Task<IResult> SaveVerificationAsync(Application application, string emailAddress, string jobTitle, AtsDbContext db, IEmailSender email, CancellationToken ct)
    {
        var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
        application.VerificationCodeHash = Hash(code); application.VerificationExpiresAt = DateTimeOffset.UtcNow.AddMinutes(15); application.LastActivityAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        await email.SendAsync(emailAddress, $"Confirm your application for {jobTitle}", $"Your confirmation code is {code}. It expires in 15 minutes.", ct);
        return Results.Accepted(value: new { message = "Check your email for a confirmation code." });
    }
}
