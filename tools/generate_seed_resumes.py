"""Writes the CVs for the fictional development candidates into src/server/Data/Seed/Resumes.

Every seeded candidate applies with a CV, like a real applicant. The career-center samples in that
folder are real public documents; the files written here are invented people with invented
employers, example.com inboxes and 555 phone numbers. Three PDF layouts and a few Word files,
because real applicants send all of these.

    python3 -m venv .venv && .venv/bin/pip install reportlab python-docx
    .venv/bin/python tools/generate_seed_resumes.py
"""

from pathlib import Path

from docx import Document
from docx.shared import Pt, RGBColor
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUTPUT = Path(__file__).resolve().parents[1] / "src" / "server" / "Data" / "Seed" / "Resumes"


def job(title, company, place, dates, *bullets):
    return {"title": title, "company": company, "place": place, "dates": dates, "bullets": list(bullets)}


PEOPLE = [
    {
        "name": "Jordan Lee", "headline": "Product Engineer", "location": "Chicago, IL", "phone": "(312) 555-0142",
        "linkedin": "linkedin.com/in/example", "layout": "classic",
        "summary": "Product engineer with seven years of experience shipping customer-facing features end to end, from the data model to the interface. Most at home on small teams where engineers talk to users.",
        "skills": ["React", "TypeScript", "C#", ".NET", "PostgreSQL", "REST APIs", "Feature flags", "Playwright"],
        "work": [
            job("Product Engineer", "Larchmont Health", "Chicago, IL", "2021 - Present",
                "Owned the patient scheduling flow end to end; rebuilt booking in React and .NET and cut drop-off by 22%.",
                "Introduced feature flags and staged rollouts, turning monthly releases into weekly ones.",
                "Paired with support every sprint to triage the top five customer issues."),
            job("Software Engineer", "Brightline Logistics", "Chicago, IL", "2018 - 2021",
                "Built the shipment tracking dashboard used by 300 dispatchers.",
                "Moved reporting queries from the app server to PostgreSQL views, halving page load times."),
            job("Junior Developer", "Corvid Studio", "Evanston, IL", "2017 - 2018",
                "Delivered client web projects in React and Node.js."),
        ],
        "education": [("B.S. Computer Science", "University of Illinois Chicago", "2017")],
    },
    {
        "name": "Sam Patel", "headline": "Senior Software Engineer", "location": "Madison, WI", "phone": "(608) 555-0119",
        "layout": "sidebar",
        "summary": "Senior engineer focused on platform reliability and data-heavy backends. Ten years building services that other teams depend on.",
        "skills": ["Go", "PostgreSQL", "Kafka", "AWS", "Terraform", "Kubernetes", "gRPC"],
        "work": [
            job("Senior Software Engineer", "Ridgefield Insurance", "Madison, WI", "2019 - Present",
                "Led the move of claims processing to an event-driven design on Kafka, handling 4M events a day.",
                "Cut PostgreSQL storage costs 35% with partitioning and retention policies.",
                "Mentored four engineers; two were promoted within a year."),
            job("Software Engineer", "Epoch Systems", "Verona, WI", "2015 - 2019",
                "Built internal APIs for billing and eligibility in Go and Java."),
        ],
        "education": [("B.S. Computer Engineering", "University of Wisconsin-Madison", "2015")],
    },
    {
        "name": "Maya Fernandez", "headline": "Full Stack Engineer", "location": "Chicago, IL", "phone": "(312) 555-0168",
        "linkedin": "linkedin.com/in/maya-fernandez-example", "layout": "modern",
        "summary": "Full stack engineer with eight years of experience building accessible web products and dependable APIs for growing teams.",
        "skills": ["TypeScript", "React", "Next.js", "Node.js", "C#", ".NET", "PostgreSQL", "AWS", "Docker", "Playwright"],
        "work": [
            job("Senior Full Stack Engineer", "Northstar Software", "Chicago, IL", "2021 - Present",
                "Led development of a React and TypeScript customer portal used by 40,000 monthly users.",
                "Built .NET and PostgreSQL services that reduced median response time by 38%.",
                "Added Playwright coverage and CI checks, cutting escaped defects by 27%."),
            job("Software Engineer", "Lakeside Labs", "Chicago, IL", "2018 - 2021",
                "Delivered accessible web workflows with React, Node.js and AWS."),
        ],
        "education": [("B.S. Computer Science", "University of Illinois Chicago", "2018")],
        "certifications": ["AWS Certified Developer - Associate (2023)"],
        "languages": ["English", "Spanish"],
    },
    {
        "name": "Elliot Shaw", "headline": "Backend Engineer", "location": "Denver, CO", "phone": "(303) 555-0177",
        "layout": "docx",
        "summary": "Backend engineer who likes boring, well-tested services. Six years in .NET on AWS.",
        "skills": ["C#", ".NET", "AWS", "SQL Server", "PostgreSQL", "Docker", "xUnit"],
        "work": [
            job("Backend Engineer", "Summit Payments", "Denver, CO", "2020 - Present",
                "Built the refunds and disputes service handling $40M a year.",
                "Wrote the integration test suite that now gates every deploy."),
            job("Software Developer", "Front Range Software", "Boulder, CO", "2018 - 2020",
                "Maintained .NET APIs for a property management product."),
        ],
        "education": [("B.S. Software Engineering", "Colorado State University", "2018")],
        "certifications": ["AWS Certified Solutions Architect - Associate (2022)"],
    },
    {
        "name": "Nina Kowalski", "headline": "Staff Engineer", "location": "Remote, US", "phone": "(414) 555-0131",
        "layout": "classic",
        "summary": "Staff engineer with twelve years in distributed systems. I lead technical direction across teams and still write code most days.",
        "skills": ["Distributed systems", "Java", "Go", "Kafka", "PostgreSQL", "System design", "Technical leadership"],
        "work": [
            job("Staff Engineer", "Meridian Commerce", "Remote", "2020 - Present",
                "Set the architecture for order processing across five teams; drove p99 latency from 900ms to 180ms.",
                "Ran the design review process and wrote the team's incident review template."),
            job("Senior Software Engineer", "Halcyon Data", "Milwaukee, WI", "2015 - 2020",
                "Built a multi-region replication layer for the customer data platform."),
            job("Software Engineer", "Stonebridge Bank", "Milwaukee, WI", "2012 - 2015",
                "Worked on payments and fraud detection services in Java."),
        ],
        "education": [("M.S. Computer Science", "Marquette University", "2012"), ("B.S. Mathematics", "Marquette University", "2010")],
    },
    {
        "name": "Omar Haddad", "headline": "Product Engineer", "location": "Detroit, MI", "phone": "(313) 555-0150",
        "layout": "sidebar",
        "summary": "Product engineer with four years building React and GraphQL apps for marketplaces.",
        "skills": ["React", "GraphQL", "TypeScript", "Node.js", "Apollo", "Jest"],
        "work": [
            job("Product Engineer", "Motorline", "Detroit, MI", "2022 - Present",
                "Built the dealer listing editor in React and GraphQL; listings created per week up 30%.",
                "Owned the search results page and its performance budget."),
            job("Frontend Developer", "Great Lakes Digital", "Ann Arbor, MI", "2020 - 2022",
                "Shipped client sites and a shared component library."),
        ],
        "education": [("B.S. Computer Science", "Wayne State University", "2020")],
        "languages": ["English", "Arabic"],
    },
    {
        "name": "Grace Oyelaran", "headline": "Site Reliability Engineer", "location": "Remote, US", "phone": "(404) 555-0123",
        "layout": "modern",
        "summary": "SRE with seven years running Kubernetes platforms. I care about clear alerts, honest SLOs and calm on-call.",
        "skills": ["Kubernetes", "Terraform", "AWS", "Prometheus", "Grafana", "Go", "Incident response"],
        "work": [
            job("Senior Site Reliability Engineer", "Cobalt Health", "Remote", "2021 - Present",
                "Ran 14 production Kubernetes clusters; moved the team to SLO-based alerting and cut pages by 60%.",
                "Wrote all cluster infrastructure as Terraform modules."),
            job("Systems Engineer", "Peachtree Hosting", "Atlanta, GA", "2017 - 2021",
                "Automated server provisioning and patching for 2,000 hosts."),
        ],
        "education": [("B.S. Information Technology", "Georgia State University", "2017")],
        "certifications": ["Certified Kubernetes Administrator (2022)"],
    },
    {
        "name": "Ben Ortiz", "headline": "DevOps Engineer", "location": "Phoenix, AZ", "phone": "(602) 555-0196",
        "layout": "classic",
        "summary": "DevOps engineer with five years of CI/CD and AWS. I make deploys dull.",
        "skills": ["AWS", "GitHub Actions", "CI/CD", "Docker", "Terraform", "Bash", "Python"],
        "work": [
            job("DevOps Engineer", "Sonoran Software", "Phoenix, AZ", "2021 - Present",
                "Rebuilt the build pipeline in GitHub Actions; average build time from 24 to 7 minutes.",
                "Introduced blue-green deploys for the main API."),
            job("Systems Administrator", "Desert Valley College", "Mesa, AZ", "2019 - 2021",
                "Managed Linux servers and campus backups."),
        ],
        "education": [("A.A.S. Network Administration", "Mesa Community College", "2019")],
        "certifications": ["AWS Certified SysOps Administrator (2021)"],
    },
    {
        "name": "Hana Suzuki", "headline": "Platform Engineer", "location": "Seattle, WA", "phone": "(206) 555-0188",
        "layout": "sidebar",
        "summary": "Platform engineer with eight years building internal tooling and observability in Go.",
        "skills": ["Go", "Observability", "OpenTelemetry", "Kubernetes", "PostgreSQL", "gRPC"],
        "work": [
            job("Senior Platform Engineer", "Cascade Freight", "Seattle, WA", "2020 - Present",
                "Built the internal deploy tool used by 60 engineers.",
                "Rolled out OpenTelemetry tracing across 40 services."),
            job("Software Engineer", "Rainier Games", "Bellevue, WA", "2016 - 2020",
                "Wrote matchmaking and telemetry services in Go."),
        ],
        "education": [("B.S. Computer Science", "University of Washington", "2016")],
        "languages": ["English", "Japanese"],
    },
    {
        "name": "Luis Moreno", "headline": "Infrastructure Engineer", "location": "Remote, US", "phone": "(512) 555-0109",
        "layout": "modern",
        "summary": "Infrastructure engineer with six years of Terraform, PostgreSQL operations and cost work on AWS.",
        "skills": ["Terraform", "PostgreSQL", "AWS", "Linux", "Ansible", "Cost optimisation"],
        "work": [
            job("Infrastructure Engineer", "Bluebonnet Energy", "Remote", "2021 - Present",
                "Cut the AWS bill 28% through rightsizing and reserved capacity.",
                "Ran PostgreSQL upgrades from 11 to 15 with no downtime."),
            job("Systems Engineer", "Hill Country Networks", "Austin, TX", "2018 - 2021",
                "Managed hosting infrastructure for 200 small business customers."),
        ],
        "education": [("B.S. Information Systems", "Texas State University", "2018")],
    },
    {
        "name": "Ada Whitfield", "headline": "Product Designer", "location": "New York, NY", "phone": "(212) 555-0184",
        "linkedin": "linkedin.com/in/ada-whitfield-example", "layout": "modern",
        "summary": "Product designer with nine years turning complex workflows into accessible, research-backed products and design systems.",
        "skills": ["Product design", "Figma", "Design systems", "User research", "Accessibility", "Prototyping"],
        "work": [
            job("Senior Product Designer", "Harbor Digital", "New York, NY", "2020 - Present",
                "Owned product design for onboarding and account administration.",
                "Created a Figma design system adopted by six teams, 120 components.",
                "Led accessibility testing that raised task completion 31%."),
            job("Product Designer", "Civic Studio", "Brooklyn, NY", "2017 - 2020",
                "Designed service tools with engineers and public-sector partners."),
        ],
        "education": [("BFA Communication Design", "Pratt Institute", "2017")],
        "certifications": ["IAAP Certified Professional in Accessibility Core Competencies (2024)"],
    },
    {
        "name": "Theo Brandt", "headline": "Senior Product Designer", "location": "Brooklyn, NY", "phone": "(718) 555-0172",
        "layout": "classic",
        "summary": "Senior product designer, ten years, research-led. I run studies myself and turn findings into shipped changes.",
        "skills": ["Figma", "User research", "Usability testing", "Information architecture", "Prototyping"],
        "work": [
            job("Senior Product Designer", "Lumen Bank", "New York, NY", "2019 - Present",
                "Led the redesign of mobile onboarding; completion from 54% to 78%.",
                "Set up a monthly research panel of 40 customers."),
            job("Product Designer", "Atlas Travel", "New York, NY", "2015 - 2019",
                "Designed booking and itinerary features for web and iOS."),
        ],
        "education": [("B.A. Cognitive Science", "University of Rochester", "2015")],
        "languages": ["English", "German"],
    },
    {
        "name": "Ines Duarte", "headline": "UX Designer", "location": "Remote, US", "phone": "(617) 555-0140",
        "layout": "sidebar",
        "summary": "UX designer with five years of research and accessibility work on healthcare and government products.",
        "skills": ["User research", "Accessibility", "WCAG", "Figma", "Journey mapping", "Content design"],
        "work": [
            job("UX Designer", "Commonwealth Digital Services", "Remote", "2021 - Present",
                "Redesigned the benefits application form; errors per submission down 45%.",
                "Ran accessibility audits with screen reader users."),
            job("UX Researcher", "Fenway Health Tech", "Boston, MA", "2019 - 2021",
                "Planned and ran interviews and usability tests for patient tools."),
        ],
        "education": [("M.S. Human Factors in Information Design", "Bentley University", "2019")],
        "languages": ["English", "Portuguese"],
    },
    {
        "name": "Kofi Mensah", "headline": "Design Lead", "location": "New York, NY", "phone": "(646) 555-0115",
        "layout": "modern",
        "summary": "Design lead with twelve years of experience and five managing designers. I build teams that ship and design systems that last.",
        "skills": ["Design leadership", "Design systems", "Hiring", "Figma", "Workshop facilitation"],
        "work": [
            job("Design Lead", "Parkline Software", "New York, NY", "2020 - Present",
                "Grew the design team from 2 to 7 and set up design critique and career levels.",
                "Led the shared design system across web and mobile."),
            job("Senior Designer", "Union Square Media", "New York, NY", "2014 - 2020",
                "Designed the publishing tools used by 300 editors."),
        ],
        "education": [("BFA Graphic Design", "School of Visual Arts", "2012")],
    },
    {
        "name": "Rosa Iglesias", "headline": "Data Analyst", "location": "Austin, TX", "phone": "(512) 555-0153",
        "layout": "docx",
        "summary": "Data analyst with four years in SQL and dbt, turning messy operational data into reports people use.",
        "skills": ["SQL", "dbt", "Looker", "Excel", "Python", "Data analysis"],
        "work": [
            job("Data Analyst", "Lone Star Retail", "Austin, TX", "2021 - Present",
                "Built the weekly store performance model in dbt that replaced 14 spreadsheets.",
                "Ran the analysis behind the new staffing schedule."),
            job("Reporting Analyst", "Capitol Health Plan", "Austin, TX", "2020 - 2021",
                "Maintained claims reporting in SQL Server."),
        ],
        "education": [("B.S. Statistics", "University of Texas at Austin", "2020")],
        "languages": ["English", "Spanish"],
    },
    {
        "name": "Felix Novak", "headline": "Analytics Engineer", "location": "Austin, TX", "phone": "(737) 555-0126",
        "layout": "classic",
        "summary": "Analytics engineer with five years building dbt models and data tests that analysts trust.",
        "skills": ["dbt", "Python", "SQL", "Snowflake", "Airflow", "Data testing"],
        "work": [
            job("Analytics Engineer", "Riverbend Software", "Austin, TX", "2021 - Present",
                "Owned the dbt project, 300 models, with tests on every source.",
                "Cut the nightly pipeline from 3 hours to 40 minutes."),
            job("Data Analyst", "Pecan Street Energy", "Austin, TX", "2019 - 2021",
                "Analysed household energy data for research partners."),
        ],
        "education": [("B.S. Economics", "Texas A&M University", "2019")],
    },
    {
        "name": "Priyanka Iyer", "headline": "Business Analyst", "location": "Dallas, TX", "phone": "(214) 555-0164",
        "layout": "sidebar",
        "summary": "Business analyst with six years in SQL and Tableau, working between operations teams and engineering.",
        "skills": ["SQL", "Tableau", "Excel", "Requirements gathering", "Process mapping"],
        "work": [
            job("Senior Business Analyst", "Trinity Logistics", "Dallas, TX", "2020 - Present",
                "Built the Tableau dashboards operations reviews every morning.",
                "Wrote requirements for the warehouse management rollout."),
            job("Business Analyst", "Metroplex Bank", "Plano, TX", "2018 - 2020",
                "Mapped loan origination processes and reporting."),
        ],
        "education": [("MBA", "University of Texas at Dallas", "2018"), ("B.Com.", "University of Mumbai", "2014")],
        "languages": ["English", "Hindi", "Tamil"],
    },
    {
        "name": "Marcus Bell", "headline": "Operations Manager", "location": "Chicago, IL", "phone": "(773) 555-0137",
        "layout": "docx",
        "summary": "Operations manager with nine years running customer onboarding and support teams.",
        "skills": ["Operations", "Customer support", "Team leadership", "Zendesk", "Process improvement"],
        "work": [
            job("Operations Manager", "Lakeview SaaS", "Chicago, IL", "2019 - Present",
                "Managed a team of 12 across onboarding and support; time to go-live down from 30 to 18 days.",
                "Set up the weekly operations review with product and engineering."),
            job("Support Team Lead", "Wrigley Commerce", "Chicago, IL", "2015 - 2019",
                "Led a team of six support agents."),
        ],
        "education": [("B.A. Business Administration", "DePaul University", "2015")],
    },
    {
        "name": "Sofia Lindqvist", "headline": "Customer Success Lead", "location": "Chicago, IL", "phone": "(312) 555-0191",
        "layout": "modern",
        "summary": "Customer success lead with seven years keeping B2B customers happy and renewing.",
        "skills": ["Customer success", "Account management", "Onboarding", "Gainsight", "Salesforce"],
        "work": [
            job("Customer Success Lead", "Prairie Analytics", "Chicago, IL", "2020 - Present",
                "Led a team of five managing 120 accounts; net retention 112%.",
                "Designed the onboarding playbook new hires now follow."),
            job("Customer Success Manager", "Loop Payroll", "Chicago, IL", "2017 - 2020",
                "Managed renewals for mid-market customers."),
        ],
        "education": [("B.A. Communication", "Northwestern University", "2017")],
        "languages": ["English", "Swedish"],
    },
    {
        "name": "Devon Clarke", "headline": "Support Operations Specialist", "location": "Milwaukee, WI", "phone": "(414) 555-0158",
        "layout": "docx",
        "summary": "Support operations specialist with four years running Zendesk and support tooling.",
        "skills": ["Zendesk", "Support operations", "Macros and automation", "Excel", "Customer support"],
        "work": [
            job("Support Operations Specialist", "Brew City Software", "Milwaukee, WI", "2021 - Present",
                "Rebuilt Zendesk routing and macros; first response time down 40%.",
                "Wrote the support knowledge base, 150 articles."),
            job("Support Agent", "Harbor Telecom", "Milwaukee, WI", "2019 - 2021",
                "Handled phone and email support for residential customers."),
        ],
        "education": [("A.A. Business", "Milwaukee Area Technical College", "2019")],
    },
    {
        "name": "Aisha Rahman", "headline": "Engineering Manager", "location": "Chicago, IL", "phone": "(312) 555-0105",
        "layout": "classic",
        "summary": "Engineering manager with eleven years in software and four leading teams. I hire well, give clear feedback and protect focus time.",
        "skills": ["Engineering management", "Hiring", "Delivery planning", "Mentoring", "Java", "System design"],
        "work": [
            job("Engineering Manager", "Fulton Market Software", "Chicago, IL", "2021 - Present",
                "Manage two teams, 11 engineers, building the billing platform.",
                "Ran 60 interviews last year and rewrote the engineering interview kit."),
            job("Senior Software Engineer", "Fulton Market Software", "Chicago, IL", "2017 - 2021",
                "Tech lead for invoicing and payments."),
            job("Software Engineer", "Second City Systems", "Chicago, IL", "2013 - 2017",
                "Built Java services for insurance quoting."),
        ],
        "education": [("B.S. Computer Science", "Illinois Institute of Technology", "2013")],
    },
    {
        "name": "Victor Almeida", "headline": "Frontend Engineer", "location": "Remote, US", "phone": "(305) 555-0144",
        "layout": "sidebar",
        "summary": "Frontend engineer with five years of React and CSS, with a soft spot for performance and design systems.",
        "skills": ["React", "CSS", "TypeScript", "Storybook", "Web performance", "Accessibility"],
        "work": [
            job("Frontend Engineer", "Biscayne Travel", "Remote", "2021 - Present",
                "Built the component library in React and Storybook used across three apps.",
                "Improved Largest Contentful Paint from 4.1s to 1.8s on the booking pages."),
            job("Web Developer", "Coral Agency", "Miami, FL", "2019 - 2021",
                "Built marketing sites and landing pages."),
        ],
        "education": [("B.S. Computer Science", "Florida International University", "2019")],
        "languages": ["English", "Portuguese"],
    },
    {
        "name": "Lena Hofmann", "headline": "QA Engineer", "location": "Remote, US", "phone": "(503) 555-0129",
        "layout": "docx",
        "summary": "QA engineer with six years of test automation. I write tests developers want to keep.",
        "skills": ["Playwright", "Testing", "Cypress", "TypeScript", "CI/CD", "Test planning"],
        "work": [
            job("QA Engineer", "Willamette Software", "Remote", "2020 - Present",
                "Built the Playwright end-to-end suite, 400 tests running on every pull request.",
                "Cut flaky tests from 12% to under 1%."),
            job("QA Analyst", "Rose City Games", "Portland, OR", "2018 - 2020",
                "Manual and automated testing for console releases."),
        ],
        "education": [("B.S. Computer Science", "Portland State University", "2018")],
        "languages": ["English", "German"],
    },
    {
        "name": "Caleb Wright", "headline": "Junior Software Engineer", "location": "Chicago, IL", "phone": "(312) 555-0199",
        "layout": "classic",
        "summary": "New graduate in computer science. Two internships and a capstone project in Python.",
        "skills": ["Python", "Django", "SQL", "Git", "JavaScript"],
        "work": [
            job("Software Engineering Intern", "Midway Analytics", "Chicago, IL", "Summer 2025",
                "Built a Django admin tool for the data team.",
                "Wrote unit tests that caught two production bugs before release."),
            job("IT Intern", "Loyola University Chicago", "Chicago, IL", "Summer 2024",
                "Supported campus labs and wrote small Python automation scripts."),
        ],
        "education": [("B.S. Computer Science", "Loyola University Chicago", "2026")],
    },
]


def contact_line(person):
    email = person["name"].lower().replace(" ", ".") + "@example.com"
    parts = [person["location"], person["phone"], email]
    if person.get("linkedin"):
        parts.append(person["linkedin"])
    return parts


def file_name(person):
    extension = "docx" if person["layout"] == "docx" else "pdf"
    return person["name"].lower().replace(" ", "-") + f"-resume.{extension}"


def styles(accent):
    return {
        "name": ParagraphStyle("name", fontName="Helvetica-Bold", fontSize=20, leading=24),
        "headline": ParagraphStyle("headline", fontName="Helvetica", fontSize=11, leading=14, textColor=accent),
        "contact": ParagraphStyle("contact", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#444444")),
        "section": ParagraphStyle("section", fontName="Helvetica-Bold", fontSize=10.5, leading=13, spaceBefore=10, spaceAfter=3, textColor=accent),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=12.5),
        "role": ParagraphStyle("role", fontName="Helvetica-Bold", fontSize=10, leading=13, spaceBefore=5),
        "meta": ParagraphStyle("meta", fontName="Helvetica-Oblique", fontSize=9, leading=12, textColor=colors.HexColor("#555555")),
        "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=9.5, leading=12.5, leftIndent=12, bulletIndent=2),
    }


def experience(person, s):
    flow = []
    for item in person["work"]:
        flow.append(Paragraph(f"{item['title']}, {item['company']}", s["role"]))
        flow.append(Paragraph(f"{item['place']} | {item['dates']}", s["meta"]))
        flow.extend(Paragraph(text, s["bullet"], bulletText="•") for text in item["bullets"])
    return flow


def extras(person, s):
    flow = [Paragraph("Education", s["section"])]
    flow.extend(Paragraph(f"<b>{degree}</b>, {school}, {year}", s["body"]) for degree, school, year in person["education"])
    if person.get("certifications"):
        flow.append(Paragraph("Certifications", s["section"]))
        flow.extend(Paragraph(text, s["body"]) for text in person["certifications"])
    if person.get("languages"):
        flow.append(Paragraph("Languages", s["section"]))
        flow.append(Paragraph(", ".join(person["languages"]), s["body"]))
    return flow


def classic(person, path):
    s = styles(colors.black)
    s["name"].alignment = s["headline"].alignment = s["contact"].alignment = TA_CENTER
    rule = lambda: HRFlowable(width="100%", thickness=0.6, color=colors.black, spaceAfter=4)
    flow = [
        Paragraph(person["name"], s["name"]),
        Paragraph(person["headline"], s["headline"]),
        Paragraph(" | ".join(contact_line(person)), s["contact"]),
        Spacer(1, 6),
        Paragraph("Summary", s["section"]), rule(), Paragraph(person["summary"], s["body"]),
        Paragraph("Experience", s["section"]), rule(), *experience(person, s),
        Paragraph("Skills", s["section"]), rule(), Paragraph(", ".join(person["skills"]), s["body"]),
        *extras(person, s),
    ]
    SimpleDocTemplate(str(path), pagesize=letter, leftMargin=0.8 * inch, rightMargin=0.8 * inch,
                      topMargin=0.7 * inch, bottomMargin=0.7 * inch, title=f"{person['name']} resume", invariant=1).build(flow)


def modern(person, path):
    s = styles(colors.HexColor("#1f4e79"))
    flow = [
        Paragraph(person["name"], s["name"]),
        Paragraph(person["headline"], s["headline"]),
        Paragraph("  ·  ".join(contact_line(person)), s["contact"]),
        HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1f4e79"), spaceBefore=6, spaceAfter=2),
        Paragraph("Profile", s["section"]), Paragraph(person["summary"], s["body"]),
        Paragraph("Core skills", s["section"]), Paragraph("  ·  ".join(person["skills"]), s["body"]),
        Paragraph("Work experience", s["section"]), *experience(person, s),
        *extras(person, s),
    ]
    SimpleDocTemplate(str(path), pagesize=letter, leftMargin=0.75 * inch, rightMargin=0.75 * inch,
                      topMargin=0.6 * inch, bottomMargin=0.6 * inch, title=f"{person['name']} resume", invariant=1).build(flow)


def sidebar(person, path):
    s = styles(colors.HexColor("#2e6b4f"))
    side = [
        Paragraph("Contact", s["section"]),
        *[Paragraph(part, s["body"]) for part in contact_line(person)],
        Paragraph("Skills", s["section"]),
        *[Paragraph(skill, s["body"]) for skill in person["skills"]],
        *extras(person, s),
    ]
    main = [
        Paragraph(person["name"], s["name"]),
        Paragraph(person["headline"], s["headline"]),
        Spacer(1, 4),
        Paragraph(person["summary"], s["body"]),
        Paragraph("Experience", s["section"]),
        *experience(person, s),
    ]
    table = Table([[side, main]], colWidths=[2.1 * inch, 4.9 * inch])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#eef4f0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
    ]))
    SimpleDocTemplate(str(path), pagesize=letter, leftMargin=0.6 * inch, rightMargin=0.6 * inch,
                      topMargin=0.6 * inch, bottomMargin=0.6 * inch, title=f"{person['name']} resume", invariant=1).build([table])


def word(person, path):
    document = Document()
    style = document.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(10.5)
    heading = document.add_paragraph()
    run = heading.add_run(person["name"])
    run.bold = True
    run.font.size = Pt(18)
    document.add_paragraph(person["headline"])
    document.add_paragraph(" | ".join(contact_line(person)))

    def section(title):
        paragraph = document.add_paragraph()
        run = paragraph.add_run(title.upper())
        run.bold = True
        run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)

    section("Summary")
    document.add_paragraph(person["summary"])
    section("Experience")
    for item in person["work"]:
        line = document.add_paragraph()
        line.add_run(f"{item['title']}, {item['company']}").bold = True
        document.add_paragraph(f"{item['place']} | {item['dates']}")
        for text in item["bullets"]:
            document.add_paragraph(text, style="List Bullet")
    section("Skills")
    document.add_paragraph(", ".join(person["skills"]))
    section("Education")
    for degree, school, year in person["education"]:
        document.add_paragraph(f"{degree}, {school}, {year}")
    if person.get("certifications"):
        section("Certifications")
        for text in person["certifications"]:
            document.add_paragraph(text)
    if person.get("languages"):
        section("Languages")
        document.add_paragraph(", ".join(person["languages"]))
    document.core_properties.author = person["name"]
    document.save(path)


WRITERS = {"classic": classic, "modern": modern, "sidebar": sidebar, "docx": word}

if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for person in PEOPLE:
        path = OUTPUT / file_name(person)
        WRITERS[person["layout"]](person, path)
        print(path.relative_to(OUTPUT.parents[4]))
