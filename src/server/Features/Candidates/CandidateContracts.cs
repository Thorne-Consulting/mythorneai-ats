using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Contracts;

public sealed record CreateCandidateRequest(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Location,
    string? CurrentTitle,
    string? LinkedInUrl,
    string Source,
    string[]? Tags,
    Guid? ReferrerId = null
);

/// <summary>Edit details. Tags are left alone when null.</summary>
public sealed record UpdateCandidateRequest(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Location,
    string? CurrentTitle,
    string? LinkedInUrl,
    string Source,
    string[]? Tags,
    bool DoNotContact,
    string? DoNotContactReason = null,
    string? GitHubUrl = null,
    string? PortfolioUrl = null,
    Guid? ReferrerId = null
);

public sealed record CandidateTagsRequest(string[] Tags);

/// <summary>
/// One action on many people: the listed <see cref="Ids"/>, or everyone matching <see cref="Filter"/>
/// (the list's query string). Actions: addTags, removeTags, doNotContact, allowContact, addToJob,
/// move, reject, delete, addToPool and removeFromPool (<see cref="PoolId"/>), dismiss (from ranking for
/// <see cref="RequisitionId"/>, with a <see cref="Reason"/>). For reject, <see cref="Status"/> "Withdrawn" closes the application as
/// withdrawn (the candidate's choice) and sends no email; anything else rejects.
/// </summary>
public sealed record CandidateBulkRequest(
    Guid[]? Ids,
    string? Filter,
    string Action,
    string[]? Tags,
    Guid? RequisitionId,
    Guid? StageId,
    string? Reason,
    bool SendEmail = false,
    string? Status = null,
    Guid? PoolId = null,
    DateTimeOffset? SendAt = null,
    bool CancelInterviews = false,
    bool WithdrawOffer = false,
    // Reject: required when the reason asks for one (RejectionReason.NeedsNote), the same for everyone.
    string? DispositionNote = null
);

public sealed record AttachmentUpdateRequest(string? Name, string? Kind);
