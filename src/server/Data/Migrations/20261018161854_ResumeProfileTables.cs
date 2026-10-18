using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyThorneAI.Ats.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ResumeProfileTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "Candidates",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Country",
                table: "Candidates",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CurrentEmployerId",
                table: "Candidates",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GitHubUrl",
                table: "Candidates",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HighestDegreeLevel",
                table: "Candidates",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "OpenToRemote",
                table: "Candidates",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<string[]>(
                name: "OtherUrls",
                table: "Candidates",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]);

            migrationBuilder.AddColumn<string>(
                name: "PortfolioUrl",
                table: "Candidates",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Region",
                table: "Candidates",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResumeModel",
                table: "Candidates",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResumeProfileJson",
                table: "Candidates",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResumePromptVersion",
                table: "Candidates",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResumeTextHash",
                table: "Candidates",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seniority",
                table: "Candidates",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "WillingToRelocate",
                table: "Candidates",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "YearsManagement",
                table: "Candidates",
                type: "numeric",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Awards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Issuer = table.Column<string>(type: "text", nullable: true),
                    Year = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Awards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Awards_Candidates_CandidateId",
                        column: x => x.CandidateId,
                        principalTable: "Candidates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CandidateLanguages",
                columns: table => new
                {
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Language = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Proficiency = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CandidateLanguages", x => new { x.CandidateId, x.Language });
                    table.ForeignKey(
                        name: "FK_CandidateLanguages_Candidates_CandidateId",
                        column: x => x.CandidateId,
                        principalTable: "Candidates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Certifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Issuer = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Year = table.Column<int>(type: "integer", nullable: true),
                    ExpiresYear = table.Column<int>(type: "integer", nullable: true),
                    Url = table.Column<string>(type: "text", nullable: true),
                    Verified = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Certifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Certifications_Candidates_CandidateId",
                        column: x => x.CandidateId,
                        principalTable: "Candidates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Companies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Companies", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Projects",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    Url = table.Column<string>(type: "text", nullable: true),
                    Year = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Projects", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Projects_Candidates_CandidateId",
                        column: x => x.CandidateId,
                        principalTable: "Candidates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Publications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    Venue = table.Column<string>(type: "text", nullable: true),
                    Year = table.Column<int>(type: "integer", nullable: true),
                    Url = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Publications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Publications_Candidates_CandidateId",
                        column: x => x.CandidateId,
                        principalTable: "Candidates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Schools",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Schools", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Skills",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Category = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Aliases = table.Column<string[]>(type: "text[]", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Skills", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WorkExperiences",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: true),
                    CompanyNameRaw = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Seniority = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    EmploymentType = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    City = table.Column<string>(type: "text", nullable: true),
                    Region = table.Column<string>(type: "text", nullable: true),
                    Country = table.Column<string>(type: "text", nullable: true),
                    IsRemote = table.Column<bool>(type: "boolean", nullable: false),
                    StartYear = table.Column<int>(type: "integer", nullable: true),
                    StartMonth = table.Column<int>(type: "integer", nullable: true),
                    EndYear = table.Column<int>(type: "integer", nullable: true),
                    EndMonth = table.Column<int>(type: "integer", nullable: true),
                    IsCurrent = table.Column<bool>(type: "boolean", nullable: false),
                    DurationMonths = table.Column<int>(type: "integer", nullable: true),
                    ManagedPeople = table.Column<int>(type: "integer", nullable: true),
                    Description = table.Column<string>(type: "text", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Verified = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkExperiences", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkExperiences_Candidates_CandidateId",
                        column: x => x.CandidateId,
                        principalTable: "Candidates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WorkExperiences_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "Educations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    SchoolId = table.Column<Guid>(type: "uuid", nullable: true),
                    SchoolNameRaw = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Degree = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    DegreeLevel = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Field = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    FieldNormalized = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    StartYear = table.Column<int>(type: "integer", nullable: true),
                    EndYear = table.Column<int>(type: "integer", nullable: true),
                    IsInProgress = table.Column<bool>(type: "boolean", nullable: false),
                    Gpa = table.Column<decimal>(type: "numeric", nullable: true),
                    GpaScale = table.Column<decimal>(type: "numeric", nullable: true),
                    Honors = table.Column<string>(type: "text", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Verified = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Educations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Educations_Candidates_CandidateId",
                        column: x => x.CandidateId,
                        principalTable: "Candidates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Educations_Schools_SchoolId",
                        column: x => x.SchoolId,
                        principalTable: "Schools",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "CandidateSkills",
                columns: table => new
                {
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    SkillId = table.Column<Guid>(type: "uuid", nullable: false),
                    Source = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    YearsUsed = table.Column<decimal>(type: "numeric", nullable: true),
                    LastUsedYear = table.Column<int>(type: "integer", nullable: true),
                    Verified = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CandidateSkills", x => new { x.CandidateId, x.SkillId });
                    table.ForeignKey(
                        name: "FK_CandidateSkills_Candidates_CandidateId",
                        column: x => x.CandidateId,
                        principalTable: "Candidates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CandidateSkills_Skills_SkillId",
                        column: x => x.SkillId,
                        principalTable: "Skills",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectSkill",
                columns: table => new
                {
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    SkillId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectSkill", x => new { x.ProjectId, x.SkillId });
                    table.ForeignKey(
                        name: "FK_ProjectSkill_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectSkill_Skills_SkillId",
                        column: x => x.SkillId,
                        principalTable: "Skills",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkExperienceSkill",
                columns: table => new
                {
                    WorkExperienceId = table.Column<Guid>(type: "uuid", nullable: false),
                    SkillId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkExperienceSkill", x => new { x.WorkExperienceId, x.SkillId });
                    table.ForeignKey(
                        name: "FK_WorkExperienceSkill_Skills_SkillId",
                        column: x => x.SkillId,
                        principalTable: "Skills",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WorkExperienceSkill_WorkExperiences_WorkExperienceId",
                        column: x => x.WorkExperienceId,
                        principalTable: "WorkExperiences",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Candidates_CurrentEmployerId",
                table: "Candidates",
                column: "CurrentEmployerId");

            migrationBuilder.CreateIndex(
                name: "IX_Candidates_HighestDegreeLevel",
                table: "Candidates",
                column: "HighestDegreeLevel");

            migrationBuilder.CreateIndex(
                name: "IX_Candidates_ResumeYearsExperience",
                table: "Candidates",
                column: "ResumeYearsExperience");

            migrationBuilder.CreateIndex(
                name: "IX_Candidates_Seniority",
                table: "Candidates",
                column: "Seniority");

            migrationBuilder.CreateIndex(
                name: "IX_Awards_CandidateId",
                table: "Awards",
                column: "CandidateId");

            migrationBuilder.CreateIndex(
                name: "IX_CandidateSkills_SkillId",
                table: "CandidateSkills",
                column: "SkillId");

            migrationBuilder.CreateIndex(
                name: "IX_Certifications_CandidateId",
                table: "Certifications",
                column: "CandidateId");

            migrationBuilder.CreateIndex(
                name: "IX_Companies_NormalizedName",
                table: "Companies",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Educations_CandidateId_SortOrder",
                table: "Educations",
                columns: new[] { "CandidateId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_Educations_DegreeLevel",
                table: "Educations",
                column: "DegreeLevel");

            migrationBuilder.CreateIndex(
                name: "IX_Educations_SchoolId",
                table: "Educations",
                column: "SchoolId");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_CandidateId",
                table: "Projects",
                column: "CandidateId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectSkill_SkillId",
                table: "ProjectSkill",
                column: "SkillId");

            migrationBuilder.CreateIndex(
                name: "IX_Publications_CandidateId",
                table: "Publications",
                column: "CandidateId");

            migrationBuilder.CreateIndex(
                name: "IX_Schools_NormalizedName",
                table: "Schools",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Skills_NormalizedName",
                table: "Skills",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkExperiences_CandidateId_SortOrder",
                table: "WorkExperiences",
                columns: new[] { "CandidateId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkExperiences_CompanyId",
                table: "WorkExperiences",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkExperienceSkill_SkillId",
                table: "WorkExperienceSkill",
                column: "SkillId");

            migrationBuilder.AddForeignKey(
                name: "FK_Candidates_Companies_CurrentEmployerId",
                table: "Candidates",
                column: "CurrentEmployerId",
                principalTable: "Companies",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // Typo-tolerant filters on names (pg_trgm is enabled by an earlier migration).
            migrationBuilder.Sql("CREATE INDEX \"IX_Companies_Name_trgm\" ON \"Companies\" USING GIN (\"Name\" gin_trgm_ops);");
            migrationBuilder.Sql("CREATE INDEX \"IX_Schools_Name_trgm\" ON \"Schools\" USING GIN (\"Name\" gin_trgm_ops);");
            migrationBuilder.Sql("CREATE INDEX \"IX_Skills_Name_trgm\" ON \"Skills\" USING GIN (\"Name\" gin_trgm_ops);");
            migrationBuilder.Sql("CREATE INDEX \"IX_WorkExperiences_Title_trgm\" ON \"WorkExperiences\" USING GIN (\"Title\" gin_trgm_ops);");
            migrationBuilder.Sql("CREATE INDEX \"IX_WorkExperiences_CompanyNameRaw_trgm\" ON \"WorkExperiences\" USING GIN (\"CompanyNameRaw\" gin_trgm_ops);");
            migrationBuilder.Sql("CREATE INDEX \"IX_Educations_SchoolNameRaw_trgm\" ON \"Educations\" USING GIN (\"SchoolNameRaw\" gin_trgm_ops);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_Companies_Name_trgm\";");
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_Schools_Name_trgm\";");
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_Skills_Name_trgm\";");
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_WorkExperiences_Title_trgm\";");
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_WorkExperiences_CompanyNameRaw_trgm\";");
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_Educations_SchoolNameRaw_trgm\";");
            migrationBuilder.DropForeignKey(
                name: "FK_Candidates_Companies_CurrentEmployerId",
                table: "Candidates");

            migrationBuilder.DropTable(
                name: "Awards");

            migrationBuilder.DropTable(
                name: "CandidateLanguages");

            migrationBuilder.DropTable(
                name: "CandidateSkills");

            migrationBuilder.DropTable(
                name: "Certifications");

            migrationBuilder.DropTable(
                name: "Educations");

            migrationBuilder.DropTable(
                name: "ProjectSkill");

            migrationBuilder.DropTable(
                name: "Publications");

            migrationBuilder.DropTable(
                name: "WorkExperienceSkill");

            migrationBuilder.DropTable(
                name: "Schools");

            migrationBuilder.DropTable(
                name: "Projects");

            migrationBuilder.DropTable(
                name: "Skills");

            migrationBuilder.DropTable(
                name: "WorkExperiences");

            migrationBuilder.DropTable(
                name: "Companies");

            migrationBuilder.DropIndex(
                name: "IX_Candidates_CurrentEmployerId",
                table: "Candidates");

            migrationBuilder.DropIndex(
                name: "IX_Candidates_HighestDegreeLevel",
                table: "Candidates");

            migrationBuilder.DropIndex(
                name: "IX_Candidates_ResumeYearsExperience",
                table: "Candidates");

            migrationBuilder.DropIndex(
                name: "IX_Candidates_Seniority",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "City",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "Country",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "CurrentEmployerId",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "GitHubUrl",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "HighestDegreeLevel",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "OpenToRemote",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "OtherUrls",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "PortfolioUrl",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "Region",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeModel",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeProfileJson",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumePromptVersion",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeTextHash",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "Seniority",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "WillingToRelocate",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "YearsManagement",
                table: "Candidates");
        }
    }
}
