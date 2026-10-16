namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    public static RouteGroupBuilder MapAtsEndpoints(this RouteGroupBuilder api)
    {
        MapDashboard(api);
        MapRequisitions(api);
        MapCandidates(api);
        MapApplications(api);
        MapInterviews(api);
        MapAdministration(api);
        MapOffers(api);
        MapApplicationMessages(api);
        MapSearch(api);
        MapResumes(api);
        MapReports(api);
        MapRanking(api);
        MapCopilot(api);
        MapConfiguration(api);
        AiEndpoints.MapAiEndpoints(api);
        return api;
    }
}
