using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    private static AppUser[] CreateDevelopmentUsers()
    {
        return
        [
            new AppUser
            {
                Email = "admin@example.test",
                DisplayName = "Avery Admin",
                Role = UserRole.Admin,
            },
            new AppUser
            {
                Email = "recruiter@example.test",
                DisplayName = "Riley Recruiter",
                Role = UserRole.Recruiter,
            },
            new AppUser
            {
                Email = "manager@example.test",
                DisplayName = "Morgan Manager",
                Role = UserRole.HiringManager,
                Department = "Engineering",
            },
            new AppUser
            {
                Email = "interviewer@example.test",
                DisplayName = "Indigo Interviewer",
                Role = UserRole.Interviewer,
                Department = "Engineering",
            },
            new AppUser
            {
                Email = "dana.recruiter@example.test",
                DisplayName = "Dana Okafor",
                Role = UserRole.Recruiter,
            },
            new AppUser
            {
                Email = "priya.manager@example.test",
                DisplayName = "Priya Raman",
                Role = UserRole.HiringManager,
                Department = "Design",
            },
            new AppUser
            {
                Email = "tomas.interviewer@example.test",
                DisplayName = "Tomas Nowak",
                Role = UserRole.Interviewer,
                Department = "Engineering",
            },
            new AppUser
            {
                Email = "asha.interviewer@example.test",
                DisplayName = "Asha Bello",
                Role = UserRole.Interviewer,
                Department = "Data",
            },
            new AppUser
            {
                Email = "former.recruiter@example.test",
                DisplayName = "Casey Lind",
                Role = UserRole.Recruiter,
                IsActive = false,
            },
        ];
    }
}
