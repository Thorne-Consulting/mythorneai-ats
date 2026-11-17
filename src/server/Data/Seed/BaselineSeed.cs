using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Data;

/// <summary>
/// The baseline set: what every workspace needs before the first job. Pipelines, rejection
/// reasons, sources, templates, candidate fields and the currency catalog, worded for every kind
/// of work. Roles, notification kinds and the automatic emails live in code and need no rows.
/// Interview kits, questions, scorecards and pay bands are the company's own and come from the
/// private seed file, never from here.
/// </summary>
public static class BaselineSeed
{
    public static async Task RunAsync(AtsDbContext db, SeedRows rows, CancellationToken ct)
    {
        await PipelinesAsync(db, rows, ct);
        await RejectionReasonsAsync(rows, ct);
        await SourcesAsync(rows, ct);
        await OfferLettersAsync(rows, ct);
        await SavedRepliesAsync(rows, ct);
        await PostingTemplatesAsync(rows, ct);
        await CustomFieldsAsync(rows, ct);
        await CurrenciesAsync(rows, ct);
        await OrganizationDefaultsAsync(db, ct);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>General settings a workspace starts with: only values that are still empty are set.</summary>
    private static async Task OrganizationDefaultsAsync(AtsDbContext db, CancellationToken ct)
    {
        var organization = await db.Organizations.FirstOrDefaultAsync(ct);
        if (organization is not null && string.IsNullOrWhiteSpace(organization.BaseCurrency))
            organization.BaseCurrency = Currencies.DefaultBase;
    }

    // ---- Pipelines -----------------------------------------------------------------------------

    private static readonly (string Name, Func<List<PipelineTemplateStage>> Stages)[] Pipelines =
    [
        ("Standard hiring", StageRules.DefaultTemplate),
        ("Engineering with technical screen", StageRules.EngineeringTemplate),
        (
            "Hourly and frontline",
            () =>
                Stages(
                    ("New", StageType.Applied, "Application received"),
                    ("Phone screen", StageType.Screen, "Under review"),
                    ("Interview", StageType.Interview, "Interviewing"),
                    ("Offer", StageType.Offer, "Offer")
                )
        ),
        (
            "Licensed and clinical",
            () =>
                Stages(
                    ("New", StageType.Applied, "Application received"),
                    ("Review", StageType.Screen, "Under review"),
                    ("Interview", StageType.Interview, "Interviewing"),
                    ("License and credential check", StageType.Other, "Checks in progress"),
                    ("Offer", StageType.Offer, "Offer")
                )
        ),
    ];

    private static List<PipelineTemplateStage> Stages(
        params (string Name, StageType Type, string Label)[] items
    ) =>
        items
            .Select(
                (x, i) =>
                    new PipelineTemplateStage
                    {
                        Name = x.Name,
                        Type = x.Type,
                        CandidateLabel = x.Label,
                        SortOrder = i,
                    }
            )
            .ToList();

    private static async Task PipelinesAsync(AtsDbContext db, SeedRows rows, CancellationToken ct)
    {
        var hasDefault = db.PipelineTemplates.Any(x => x.IsDefault);
        foreach (var (name, make) in Pipelines)
        {
            var stages = make();
            var names = stages.Select(x => x.Name).ToArray();
            var isDefault = !hasDefault && name == Pipelines[0].Name;
            await rows.EnsureAsync<PipelineTemplate>(
                $"pipeline:{CatalogSeed.Slug(name)}",
                x => x.Name == name,
                () =>
                    new PipelineTemplate
                    {
                        Name = name,
                        IsDefault = isDefault,
                        Stages = stages,
                        StageNames = names,
                    },
                x => x.Name = name,
                // Only the name: stages are edited on the Pipelines page and are never rewritten.
                x => Seeding.Fingerprint(x.Name),
                ct
            );
            if (isDefault)
                hasDefault = true;
        }
    }

    // ---- Rejection reasons ---------------------------------------------------------------------

    public static readonly (string Label, ApplicationStatus Kind)[] RejectionReasons =
    [
        ("Does not meet minimum requirements", ApplicationStatus.Rejected),
        ("Skills mismatch", ApplicationStatus.Rejected),
        ("Experience mismatch", ApplicationStatus.Rejected),
        ("Missing license or certification", ApplicationStatus.Rejected),
        ("Compensation mismatch", ApplicationStatus.Rejected),
        ("Location or availability", ApplicationStatus.Rejected),
        ("Shift or schedule does not fit", ApplicationStatus.Rejected),
        ("Interview feedback", ApplicationStatus.Rejected),
        ("Did not attend the interview", ApplicationStatus.Rejected),
        ("Background or reference check", ApplicationStatus.Rejected),
        ("Hired someone else", ApplicationStatus.Rejected),
        ("Position closed", ApplicationStatus.Rejected),
        ("Other", ApplicationStatus.Rejected),
        ("Withdrew", ApplicationStatus.Withdrawn),
        ("Accepted another offer", ApplicationStatus.Withdrawn),
        ("Declined the offer", ApplicationStatus.Withdrawn),
        ("No longer interested", ApplicationStatus.Withdrawn),
        ("Did not respond", ApplicationStatus.Withdrawn),
    ];

    private static async Task RejectionReasonsAsync(SeedRows rows, CancellationToken ct)
    {
        for (var i = 0; i < RejectionReasons.Length; i++)
        {
            var (label, kind) = RejectionReasons[i];
            var order = i;
            await rows.EnsureAsync<RejectionReason>(
                $"rejection-reason:{CatalogSeed.Slug(label)}",
                x => x.Label == label,
                () => new RejectionReason { Label = label },
                x =>
                {
                    x.Label = label;
                    x.Kind = kind;
                    x.NeedsNote = label == "Other";
                    x.SortOrder = order;
                },
                x => Seeding.Fingerprint(x.Label, x.Kind, x.NeedsNote, x.SortOrder, x.ArchivedAt),
                ct
            );
        }
    }

    // ---- Sources -------------------------------------------------------------------------------

    public static readonly (string Name, SourceCategory Category, string[] Codes)[] Sources =
    [
        .. Api.Sources.Standard,
        ("Walk-in", SourceCategory.Other, ["walkin", "walk-in"]),
        ("Internal move", SourceCategory.Other, ["internal"]),
        ("Former employee", SourceCategory.Other, ["rehire", "alumni"]),
        ("Job fair", SourceCategory.Event, ["jobfair", "fair"]),
        ("School or college", SourceCategory.Event, ["school", "campus", "college"]),
        ("Staffing agency", SourceCategory.Agency, ["staffing"]),
        ("Government job center", SourceCategory.Other, ["jobcenter", "jobcentre"]),
        ("Professional association", SourceCategory.Other, ["association"]),
        ("ZipRecruiter", SourceCategory.JobBoard, ["ziprecruiter", "zip"]),
        ("Craigslist", SourceCategory.JobBoard, ["craigslist"]),
    ];

    private static async Task SourcesAsync(SeedRows rows, CancellationToken ct)
    {
        foreach (var (name, category, codes) in Sources)
            await rows.EnsureAsync<Source>(
                $"source:{CatalogSeed.Slug(name)}",
                x => x.Name == name,
                () => new Source { Name = name },
                x =>
                {
                    x.Name = name;
                    x.Category = category;
                    x.Codes = codes;
                },
                x => Seeding.Fingerprint(x.Name, x.Category, x.Codes, x.IsActive),
                ct
            );
    }

    // ---- Offer letters -------------------------------------------------------------------------

    public const string HourlyLetterName = "Hourly offer letter";

    public const string HourlyLetterBody = """
        Dear {{firstName}},

        We are pleased to offer you the position of **{{jobTitle}}** at {{company}}.

        ## Your offer

        {{terms}}

        Your pay is {{salary}} per {{payPeriod}}. Your manager will be {{managerName}}. Your schedule and shift pattern are set with your manager before your start date.

        ## Next steps

        To accept, choose **Accept offer** on this page. If you have a question, message us and we will answer.

        Kind regards,

        {{senderName}}, {{company}}
        """;

    private static async Task OfferLettersAsync(SeedRows rows, CancellationToken ct)
    {
        foreach (
            var (name, body) in new[]
            {
                (OfferLetters.StandardName, OfferLetters.StandardBody),
                (HourlyLetterName, HourlyLetterBody),
            }
        )
            await rows.EnsureAsync<EmailTemplate>(
                $"offer-letter:{CatalogSeed.Slug(name)}",
                x => x.Kind == TemplateKind.OfferLetter && x.Name == name,
                () =>
                    new EmailTemplate
                    {
                        Kind = TemplateKind.OfferLetter,
                        Name = name,
                        Subject = "",
                        Body = body,
                    },
                x =>
                {
                    x.Name = name;
                    x.Body = body;
                },
                x => Seeding.Fingerprint(x.Name, x.Body),
                ct
            );
    }

    // ---- Saved replies -------------------------------------------------------------------------

    private const string Sign = "\n\n{{senderName}}\n{{company}}";

    public static readonly (
        string Name,
        string Category,
        string Subject,
        string Body
    )[] SavedReplies =
    [
        (
            "Thanks for applying",
            "Updates",
            "Your application for {{jobTitle}}",
            "Hi {{firstName}},\n\nThank you for your application for the {{jobTitle}} role at {{company}}. We read every application. We will write to you again when we have news.\n\nYou can follow your application here: {{portalLink}}"
                + Sign
        ),
        (
            "Book a phone call",
            "Scheduling",
            "A short call about {{jobTitle}}",
            "Hi {{firstName}},\n\nWe would like to talk with you about the {{jobTitle}} role. The call takes about 20 minutes. Reply with two or three times that suit you this week, and we will confirm one."
                + Sign
        ),
        (
            "Invite to an interview",
            "Scheduling",
            "Interview for {{jobTitle}} at {{company}}",
            "Hi {{firstName}},\n\nWe would like to invite you to an interview for the {{jobTitle}} role. We will send a calendar invitation with the time, the place or the video link, and the names of the people you will meet.\n\nIf you need to change the time, reply to this email."
                + Sign
        ),
        (
            "Interview on site: what to bring",
            "Scheduling",
            "Your interview at {{company}}: what to bring",
            "Hi {{firstName}},\n\nFor your interview, bring a photo ID. If the role needs a license or a certificate, bring that too. Plan to arrive 10 minutes early. Ask for the hiring team at reception."
                + Sign
        ),
        (
            "Ask for documents",
            "Documents",
            "Documents we need for {{jobTitle}}",
            "Hi {{firstName}},\n\nTo continue with the {{jobTitle}} role, we need copies of these documents:\n\n- Proof of your right to work\n- Any license or certificate the role needs\n- Two references we can contact\n\nUpload them in your candidate portal: {{portalLink}}"
                + Sign
        ),
        (
            "Still in review",
            "Updates",
            "Update on your {{jobTitle}} application",
            "Hi {{firstName}},\n\nYour application for {{jobTitle}} is still in review. We expect to have news within the next two weeks. Thank you for your patience."
                + Sign
        ),
        (
            "After the interview",
            "Updates",
            "Thank you for your interview",
            "Hi {{firstName}},\n\nThank you for your time today. The team will meet this week to compare notes, and we will write to you with the next step."
                + Sign
        ),
        (
            "Keep in touch",
            "Updates",
            "Future roles at {{company}}",
            "Hi {{firstName}},\n\nWe did not have a role that fits right now, but we would like to stay in touch. We will contact you when a role opens that matches your experience."
                + Sign
        ),
        (
            "Reference check",
            "Documents",
            "Reference check for {{jobTitle}}",
            "Hi {{firstName}},\n\nWe are at the reference stage for the {{jobTitle}} role. Send the names, roles and contact details of two people who have managed your work. We will tell you before we contact them."
                + Sign
        ),
    ];

    private static async Task SavedRepliesAsync(SeedRows rows, CancellationToken ct)
    {
        foreach (var (name, category, subject, body) in SavedReplies)
            await rows.EnsureAsync<EmailTemplate>(
                $"saved-reply:{CatalogSeed.Slug(name)}",
                x => x.Kind == TemplateKind.Saved && x.OwnerEmail == null && x.Name == name,
                () =>
                    new EmailTemplate
                    {
                        Kind = TemplateKind.Saved,
                        Name = name,
                        Subject = subject,
                        Body = body,
                    },
                x =>
                {
                    x.Name = name;
                    x.Category = category;
                    x.Subject = subject;
                    x.Body = body;
                },
                x => Seeding.Fingerprint(x.Name, x.Category, x.Subject, x.Body),
                ct
            );
    }

    // ---- Posting templates ---------------------------------------------------------------------

    private const string Header =
        "## About {{company}}\n\nWe hire people for every kind of work, and we treat every application the same way: we read it, we answer it, and we tell you where you stand.";

    private const string Benefits =
        "## What we offer\n\n- Pay that matches the role and your experience\n- Paid time off\n- Health cover\n- Training for the job and for the next one";

    public static readonly (string Name, string Description)[] PostingTemplates =
    [
        (
            "General",
            "## The role\n\nDescribe the work in a few short sentences: what the person does each day, who they work with, and what a good first year looks like.\n\n## What you need\n\n- The experience or training the role needs\n- The licenses or certificates it needs, if any\n- The hours and the place of work"
        ),
        (
            "Nursing and healthcare",
            "## The role\n\nYou care for patients as part of a team. You assess, plan and record care, give treatments, and keep patients and families informed.\n\n## What you need\n\n- A current nursing or clinical license for this region\n- Current basic life support certification\n- Experience in a similar setting, or a completed placement\n\n## Shifts\n\nSay which shifts the role covers (days, nights, weekends) and the usual rotation."
        ),
        (
            "Retail and customer service",
            "## The role\n\nYou serve customers, keep the shop floor or the service desk ready, handle payments and returns, and help the team hit its daily goals.\n\n## What you need\n\n- A friendly and clear way with people\n- Reliable attendance, including weekends when the rota needs it\n- Basic numeracy for payments and stock counts\n\n## Hours\n\nSay the weekly hours, the shift pattern and whether the role is full time, part time or seasonal."
        ),
        (
            "Operations and warehouse",
            "## The role\n\nYou receive, pick, pack and ship goods, keep the work area safe and tidy, and record what moves. Some roles drive a forklift or a van.\n\n## What you need\n\n- Able to lift and move goods safely for a full shift\n- Attention to counts and labels\n- A forklift license or a driving license where the role needs one\n\n## Hours\n\nSay the shift pattern and any overtime."
        ),
        (
            "Finance and accounting",
            "## The role\n\nYou keep the numbers right: ledgers, invoices, payments, reconciliations and month-end close. You work with other teams to explain what the numbers say.\n\n## What you need\n\n- Training or a qualification in accounting or finance\n- Experience with an accounting system and spreadsheets\n- Care with detail and with deadlines"
        ),
        (
            "Skilled trades",
            "## The role\n\nYou install, maintain and repair equipment or buildings to the standard the trade requires, keep records of the work, and follow the safety rules on every site.\n\n## What you need\n\n- A completed apprenticeship or trade certificate\n- The licenses this region requires for the trade\n- A driving license, if the role travels between sites\n\n## Tools and vehicle\n\nSay whether the company provides tools and a vehicle."
        ),
        (
            "Education and training",
            "## The role\n\nYou plan and give lessons or training sessions, assess progress, and keep records for each learner. You work with colleagues and families or managers to support each learner.\n\n## What you need\n\n- A teaching or training qualification, or experience in the subject\n- The background checks this region requires for work with learners\n- Clear written and spoken communication"
        ),
        (
            "Administration and office",
            "## The role\n\nYou keep the office running: calendars, correspondence, records, orders and visitors. You are often the first person a customer or a colleague talks to.\n\n## What you need\n\n- Experience with email, calendars, spreadsheets and documents\n- Clear and polite communication\n- Able to plan your own work and keep to deadlines"
        ),
        (
            "Sales",
            "## The role\n\nYou find and keep customers. You understand what they need, show them how we can help, agree terms, and record every step in the sales system.\n\n## What you need\n\n- Experience in sales or in a role that serves customers\n- Comfortable with targets and with follow-up\n- A driving license, if the role visits customers\n\n## Pay\n\nSay how base pay and commission work."
        ),
        (
            "Engineering and technology",
            "## The role\n\nYou design, build and support the systems the company runs on. You work with the people who use them, and you leave the code and the documents better than you found them.\n\n## What you need\n\n- Experience with the languages, tools or systems the role uses\n- Able to explain a technical choice to someone outside the team\n- Care for reliability and security"
        ),
    ];

    private static async Task PostingTemplatesAsync(SeedRows rows, CancellationToken ct)
    {
        foreach (var (name, description) in PostingTemplates)
            await rows.EnsureAsync<PostingTemplate>(
                $"posting-template:{CatalogSeed.Slug(name)}",
                x => x.Name == name,
                () =>
                    new PostingTemplate
                    {
                        Name = name,
                        HeaderMarkdown = Header,
                        DescriptionMarkdown = description,
                        BenefitsMarkdown = Benefits,
                    },
                x =>
                {
                    x.Name = name;
                    x.HeaderMarkdown = Header;
                    x.DescriptionMarkdown = description;
                    x.BenefitsMarkdown = Benefits;
                },
                x =>
                    Seeding.Fingerprint(
                        x.Name,
                        x.HeaderMarkdown,
                        x.DescriptionMarkdown,
                        x.BenefitsMarkdown,
                        x.IsActive
                    ),
                ct
            );
    }

    // ---- Candidate fields ----------------------------------------------------------------------

    public static readonly (
        string Key,
        string Label,
        string Type,
        string[] Options
    )[] CustomFields =
    [
        (
            "notice-period",
            "Notice period",
            "select",
            ["Immediate", "2 weeks", "1 month", "2 months or more"]
        ),
        ("work-authorization", "Work authorization", "text", []),
        ("licenses", "Licenses and certifications", "text", []),
        (
            "shift-availability",
            "Shift availability",
            "select",
            ["Days", "Evenings", "Nights", "Weekends", "Any"]
        ),
    ];

    private static async Task CustomFieldsAsync(SeedRows rows, CancellationToken ct)
    {
        for (var i = 0; i < CustomFields.Length; i++)
        {
            var (key, label, type, options) = CustomFields[i];
            var order = i;
            await rows.EnsureAsync<CustomFieldDefinition>(
                $"custom-field:{key}",
                x => x.Key == key,
                () => new CustomFieldDefinition { Key = key, Label = label },
                x =>
                {
                    x.Label = label;
                    x.Type = type;
                    x.Options = options;
                    x.SortOrder = order;
                },
                x => Seeding.Fingerprint(x.Label, x.Type, x.Options, x.SortOrder),
                ct
            );
        }
    }

    // ---- Currencies ----------------------------------------------------------------------------

    private static async Task CurrenciesAsync(SeedRows rows, CancellationToken ct)
    {
        for (var i = 0; i < Currencies.Catalog.Length; i++)
        {
            var info = Currencies.Catalog[i];
            var order = i;
            var supported = Currencies.DefaultSupported.Contains(info.Code);
            await rows.EnsureAsync<Currency>(
                $"currency:{info.Code.ToLowerInvariant()}",
                x => x.Code == info.Code,
                () =>
                    new Currency
                    {
                        Code = info.Code,
                        Name = info.Name,
                        Symbol = info.Symbol,
                        IsSupported = supported,
                    },
                x =>
                {
                    x.Name = info.Name;
                    x.Symbol = info.Symbol;
                    x.Decimals = info.Decimals;
                    x.SortOrder = order;
                },
                // Not IsSupported: that is the admin's choice on the Currencies page.
                x => Seeding.Fingerprint(x.Name, x.Symbol, x.Decimals, x.SortOrder),
                ct
            );
        }
    }
}
