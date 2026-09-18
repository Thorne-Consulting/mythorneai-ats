using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Contracts;

public sealed record CreateApplicationRequest(Guid CandidateId, Guid RequisitionId, string Source);

public sealed record MoveApplicationRequest(
    Guid StageId,
    ApplicationStatus Status,
    string? DispositionReason
);

public sealed record BulkMoveApplicationsRequest(
    Guid[] ApplicationIds,
    Guid StageId,
    ApplicationStatus Status,
    string? DispositionReason
);

public sealed record AddNoteRequest(string Body, bool IsPrivate);
