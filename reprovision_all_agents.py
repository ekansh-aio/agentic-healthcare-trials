#!/usr/bin/env python3
"""
Re-provision All Voicebot Agents
Applies the latest configuration to all existing voicebot campaigns:
- eleven_multilingual_v2 TTS model (no audio tags)
- Working turn detection settings (threshold 0.4, etc.)
- Clean opening messages without brackets
"""

import asyncio
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app.models.models import Advertisement
from app.core.config import settings
from app.services.ai.voicebot_agent import VoicebotAgentService

async def reprovision_all():
    """Re-provision all voicebot campaigns"""

    # Create async engine
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
    )

    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        # Find all advertisements with voicebot enabled
        result = await session.execute(
            select(Advertisement).where(
                Advertisement.bot_config.isnot(None)
            )
        )
        ads = result.scalars().all()

        print("=" * 70)
        print("RE-PROVISIONING ALL VOICEBOT AGENTS")
        print("=" * 70)
        print(f"\nFound {len(ads)} voicebot campaigns\n")

        success_count = 0
        error_count = 0

        for ad in ads:
            bot_config = ad.bot_config or {}
            agent_id = bot_config.get('elevenlabs_agent_id')

            print(f"[{ad.id}] {ad.title or 'Untitled'}")

            if not agent_id:
                print(f"  → SKIP: No agent provisioned yet")
                continue

            try:
                service = VoicebotAgentService(session)
                agent = await service.provision_agent(ad.id)
                print(f"  ✓ SUCCESS: Agent {agent['agent_id']}")
                print(f"    - Model: eleven_multilingual_v2")
                print(f"    - Turn detection: threshold=0.4, silence=700ms")
                print(f"    - Audio tags: DISABLED")
                success_count += 1
            except Exception as e:
                print(f"  ✗ ERROR: {str(e)}")
                error_count += 1

            print()

        print("=" * 70)
        print(f"COMPLETE!")
        print(f"  ✓ Success: {success_count}")
        print(f"  ✗ Errors:  {error_count}")
        print("=" * 70)

        if success_count > 0:
            print("\n✅ All successful agents now have:")
            print("   - eleven_multilingual_v2 TTS model")
            print("   - Clean opening messages (no brackets)")
            print("   - Working interruption settings")
            print("   - No audio tag instructions")
            print("\nTest a voice call to verify!")

    await engine.dispose()

if __name__ == "__main__":
    try:
        asyncio.run(reprovision_all())
    except KeyboardInterrupt:
        print("\n\n[Interrupted by user]")
    except Exception as e:
        print(f"\n\n[FATAL ERROR] {e}")
        import traceback
        traceback.print_exc()
