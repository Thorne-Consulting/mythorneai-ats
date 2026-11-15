using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Contracts;

public sealed record CreateApplicationRequest(Guid CandidateId, Guid RequisitionId, string Source);

public sealed record MoveApplicationRequest(
    Guid StageId,
    ApplicationStatus Status,
    string? DispositionReason,
    string? Message = null,
    // For a stage set to email on entry: false skips that email for this move ("Always" stages),
    // true sends it ("Ask" stages). On a rejection, false sends no rejection email.
    bool? SendEmail = null,
    // Send the stage or rejection email later instead of now (the outbox waits until then).
    DateTimeOffset? SendAt = null,
    // On reject or withdraw: cancel upcoming interviews (interviewers are told) and withdraw an open offer.
    bool? CancelInterviews = null,
    bool? WithdrawOffer = null,
    // Required when the reason asks for one (RejectionReason.NeedsNote).
    string? DispositionNote = null
);

public sealed record BulkMoveApplicationsRequest(
    Guid[] ApplicationIds,
    Guid StageId,
    ApplicationStatus Status,
    string? DispositionReason,
    bool? SendEmail = null,
    string? DispositionNote = null
);

public sealed record AddNoteRequest(string Body, bool IsPrivate);
