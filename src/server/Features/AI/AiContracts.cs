namespace MyThorneAI.Ats.Api.Contracts;

public sealed record DraftMessageRequest(Guid ApplicationId, string Purpose, string Notes);
