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
        MapSearch(api);
        MapResumes(api);
        return api;
    }
}
