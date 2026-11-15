using System.Text.Json;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Contracts;

/// <summary>
/// A new job. Members (people and roles) replace OwnerEmail and RecruiterEmail when given.
/// Description is the whole posting as applicants read it; the template's sections are not added
/// again on the server. Questions default to the template's. CopyFromId takes the stages and
/// interview kits of an existing job instead of a pipeline.
/// </summary>
public sealed record CreateRequisitionRequest(
    string Title,
    string Department,
    string Location,
    string EmploymentType,
    string WorkMode,
    int Openings,
    string? OwnerEmail,
    string? RecruiterEmail,
    string Description,
    DateOnly? TargetStartDate,
    Guid? PostingTemplateId = null,
    Guid? PipelineTemplateId = null,
    MemberInput[]? Members = null,
    PlaceInput? Place = null,
    SalaryInput? Salary = null,
    QuestionInput[]? Questions = null,
    Guid? CopyFromId = null,
    Guid? DraftId = null
);

/// <summary>The create-job wizard's form as it stands. Data is the wizard's own JSON.</summary>
public sealed record SaveJobDraftRequest(string? Title, int Step, JsonElement Data);

/// <summary>Structured location. Country is an ISO code ("US"); RemoteCountries only for remote jobs.</summary>
public sealed record PlaceInput(
    string? City,
    string? Region,
    string? Country,
    string[]? RemoteCountries = null
);

/// <summary>Pay range. Period is Year, Month or Hour; Show puts it on the careers page.</summary>
public sealed record SalaryInput(
    decimal? Min,
    decimal? Max,
    string? Currency,
    string? Period,
    bool Show
);

public sealed record UpdateRequisitionRequest(
    string Title,
    string Department,
    string Location,
    string EmploymentType,
    string WorkMode,
    int Openings,
    string OwnerEmail,
    string RecruiterEmail,
    string Description,
    DateOnly? TargetStartDate,
    PlaceInput? Place = null,
    SalaryInput? Salary = null
);

/// <summary>
/// Reason is required for OnHold, Closed and Cancelled. RejectActive, when closing (Filled, Closed,
/// Cancelled), rejects every active candidate with that reason and optionally emails them.
/// </summary>
public sealed record ChangeRequisitionStatusRequest(
    RequisitionStatus Status,
    string? Reason,
    RejectActiveCandidates? RejectActive = null
);

public sealed record RejectActiveCandidates(string Reason, bool SendEmail);

/// <summary>Company intro (header), role description starter and benefits, plus default questions.</summary>
public sealed record SavePostingTemplateRequest(
    string Name,
    string? HeaderMarkdown,
    string? DescriptionMarkdown,
    string? BenefitsMarkdown,
    QuestionInput[]? Questions = null
);

/// <summary>
/// A job's whole stage list, in order, ending with its Hired stage. A stage with an Id keeps its
/// candidates; MoveTo says where the candidates of each removed stage go.
/// </summary>
public sealed record SaveStagesRequest(StageInput[] Stages, Dictionary<Guid, Guid>? MoveTo = null);

public sealed record StageInput(
    Guid? Id,
    string Name,
    StageType Type,
    string? CandidateLabel,
    StageEmail EmailOnEntry = StageEmail.Off,
    int? TargetDays = null,
    Guid? AssessmentId = null
);

/// <summary>A pipeline's stages before Hired, which every job gets at the end.</summary>
public sealed record SavePipelineRequest(string Name, StageInput[] Stages, bool IsDefault);

/// <summary>The job's whole hiring team.</summary>
public sealed record SaveMembersRequest(MemberInput[] Members);

public sealed record MemberInput(Guid UserId, RequisitionRole Role);

/// <summary>
/// The stage email for people just moved into StageId. Subject and Body replace the template,
/// for one person only. The email waits out the undo window before it goes.
/// </summary>
public sealed record StageEmailRequest(
    Guid[] ApplicationIds,
    Guid StageId,
    string? Subject = null,
    string? Body = null
);

public sealed record CancelStageEmailsRequest(Guid[] Ids);
