import asyncio
import json
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.models import Company, CompanyDocument, SkillConfig
from app.schemas.schemas import TrainingStatus
from app.core.bedrock import get_client, get_model, is_configured

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR          = os.path.dirname(os.path.abspath(__file__))
SKILLS_DIR        = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "..", "..", "skills"))
TEMPLATES_DIR     = os.path.join(SKILLS_DIR, "templates")
OUTPUT_DIR        = os.path.join(SKILLS_DIR, "trained")
TRAINER_SKILL     = os.path.join(TEMPLATES_DIR, "trainer_template.md")

TEMPLATES_TO_TRAIN = ["curator", "reviewer"]


# ── Helpers ──────────────────────────────────────────────────────────────────
def load_file(path: str) -> str:
    with open(path, "r") as f:
        return f.read()


def call_trainer(client, trainer_skill: str, template: str, company_data: dict) -> str:
    print(f"    Calling Claude...")
    response = client.messages.create(
        model=get_model(),
        max_tokens=4096,
        system=trainer_skill,
        messages=[
            {
                "role": "user",
                "content": f"""## Skill Template
{template}

## Company Onboarding Data
{json.dumps(company_data, indent=2)}
"""
            }
        ]
    )
    return response.content[0].text


# ── TrainingService (used by onboarding API route) ────────────────────────────

class TrainingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def train_company_skills(self, company_id: str) -> TrainingStatus:
        # Load company record
        result = await self.db.execute(select(Company).where(Company.id == company_id))
        company = result.scalar_one_or_none()
        if not company:
            raise ValueError(f"Company {company_id} not found")

        # Acquire a PostgreSQL advisory lock scoped to this company so that
        # concurrent training requests queue up rather than racing.
        # hashtext() converts the company_id string to a stable int key.
        await self.db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:cid))"), {"cid": company_id})

        # Load all company documents
        docs_result = await self.db.execute(
            select(CompanyDocument).where(CompanyDocument.company_id == company_id)
        )
        docs = docs_result.scalars().all()

        # Build company_data dict that mirrors the JSON format the trainer expects
        def concat(doc_type):
            return "\n".join(d.content for d in docs if d.doc_type == doc_type and d.content)

        company_data = {
            "company_name":       company.name,
            "industry":           company.industry or "",
            "usp_summary":        concat("usp"),
            "marketing_goals":    concat("marketing_goal"),
            "compliance_notes":   concat("compliance"),
            "ethical_guidelines": concat("ethical_guideline"),
            "lessons_learned":    concat("reference") or "No lessons learned yet.",
        }

        trainer_skill = load_file(TRAINER_SKILL)
        skill_versions = {}

        for skill_name in TEMPLATES_TO_TRAIN:
            print(f"  -> Training {skill_name} skill for company {company.name}...")
            template_path = os.path.join(TEMPLATES_DIR, f"{skill_name}_template.md")
            template = load_file(template_path)

            if is_configured():
                client = get_client()
                filled = await asyncio.to_thread(
                    call_trainer, client, trainer_skill, template, company_data
                )
            else:
                print(f"    No AI backend configured, storing template as-is")
                filled = template

            # Upsert: insert if not exists, update skill_md + bump version if exists.
            # ON CONFLICT requires a unique constraint on (company_id, skill_type).
            # If that constraint is missing, add it:
            #   ALTER TABLE skill_configs ADD CONSTRAINT uq_skill_company_type
            #     UNIQUE (company_id, skill_type);
            stmt = (
                pg_insert(SkillConfig)
                .values(
                    company_id=company_id,
                    skill_type=skill_name,
                    skill_md=filled,
                    version=1,
                )
                .on_conflict_do_update(
                    index_elements=["company_id", "skill_type"],
                    set_={
                        "skill_md": filled,
                        "version":  SkillConfig.version + 1,
                    },
                )
                .returning(SkillConfig.version)
            )
            row = await self.db.execute(stmt)
            version = row.scalar_one()

            skill_versions[skill_name] = version
            print(f"  [OK] {skill_name} skill saved to DB (v{version})")

        await self.db.commit()

        return TrainingStatus(
            company_id=company_id,
            curator_ready=True,
            reviewer_ready=True,
            skill_versions=skill_versions,
        )


# ── Standalone script (python trainer.py) ────────────────────────────────────

def train():
    COMPANY_DATA_PATH = os.path.join(BASE_DIR, "sample_company.json")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if not is_configured():
        raise EnvironmentError("No AI backend configured. Set USE_BEDROCK=true or ANTHROPIC_API_KEY.")

    client        = get_client()
    trainer_skill = load_file(TRAINER_SKILL)
    company_data  = json.loads(load_file(COMPANY_DATA_PATH))

    print(f"Training skills for: {company_data['company_name']} ({company_data['industry']})\n")

    for skill_name in TEMPLATES_TO_TRAIN:
        print(f"  -> Training {skill_name} skill...")
        template_path = os.path.join(TEMPLATES_DIR, f"{skill_name}_template.md")
        template      = load_file(template_path)

        filled = call_trainer(client, trainer_skill, template, company_data)

        output_path = os.path.join(OUTPUT_DIR, f"{skill_name}_skill.md")
        with open(output_path, "w") as f:
            f.write(filled)

        print(f"  [OK] {skill_name}_skill.md written -> {output_path}\n")

    print("Training complete.")


if __name__ == "__main__":
    train()