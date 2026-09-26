namespace MyThorneAI.Ats.Api.Contracts;

public sealed record DraftMessageRequest(Guid ApplicationId, string Purpose, string Notes);

public sealed record NaturalLanguageSearchRequest(string Query, Guid? RequisitionId);

public sealed record SummarizeInterviewRequest(Guid InterviewId);
