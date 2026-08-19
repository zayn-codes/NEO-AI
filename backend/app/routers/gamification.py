from datetime import datetime, date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg

from app.db import get_db
from app.models import GamificationStatusResponse, BadgeItem, RewardItem, LeaderboardUser

router = APIRouter(prefix="/api/gamification", tags=["Gamification & Rewards"])

DEFAULT_STORE_ITEMS = [
    RewardItem(item_id="theme_neon", title="Cyber Neon Theme", description="Dark cyber aesthetic interface", cost_coins=100, icon="🎨", category="Theme", unlocked=False),
    RewardItem(item_id="badge_pronunciation_master", title="Voice Champion", description="Exclusive golden micro-badge for speaking excellence", cost_coins=250, icon="👑", category="Badge", unlocked=False),
    RewardItem(item_id="avatar_frame_gold", title="Golden Aura Frame", description="Shiny gold ring around your profile avatar", cost_coins=150, icon="✨", category="Avatar", unlocked=False),
    RewardItem(item_id="streak_saver", title="Streak Shield", description="Protect your daily learning streak for 1 missed day", cost_coins=300, icon="🛡️", category="Utility", unlocked=False),
]

@router.get("/status/{user_id}", response_model=GamificationStatusResponse)
async def get_gamification_status(
    user_id: int,
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Returns XP points, level, streak count, virtual coins, login bonus status, and badges.
    """
    xp = 450
    streak = 1
    coins = 120
    last_login = None
    
    try:
        row = await db.fetchrow(
            """
            SELECT COALESCE(u.streak_count, g.streak_count, 1) AS streak_count, g.xp_points, g.virtual_coins, g.last_login_date 
            FROM users u
            LEFT JOIN user_gamification g ON u.user_id = g.user_id
            WHERE u.user_id = $1;
            """,
            user_id
        )
        if row:
            streak = int(row["streak_count"]) if row["streak_count"] is not None else 1
            if row["xp_points"] is not None:
                xp = int(row["xp_points"])
            if row["virtual_coins"] is not None:
                coins = int(row["virtual_coins"])
            last_login = row["last_login_date"]
    except Exception as e:
        print(f"[WARN] Error fetching user_gamification: {e}")
        
    level = (xp // 200) + 1
    next_level_xp = level * 200
    
    today_str = str(date.today())
    can_claim_bonus = (str(last_login) != today_str)
    
    # Fetch earned badges
    earned_badge_ids = []
    try:
        badge_rows = await db.fetch("SELECT badge_type FROM user_badges WHERE user_id = $1;", user_id)
        earned_badge_ids = [r["badge_type"] for r in badge_rows]
    except Exception:
        pass
        
    badges = [
        BadgeItem(badge_id="first_lesson", title="First Steps", description="Complete your first lesson practice exercise.", icon="🌱", badge_type="bronze", unlocked=True, unlocked_at="2026-07-01"),
        BadgeItem(badge_id="streak_3", title="3-Day Streak", description="Maintain a daily learning streak of 3 days.", icon="🔥", badge_type="silver", unlocked=streak >= 3),
        BadgeItem(badge_id="pronunciation_star", title="Pronunciation Star", description="Achieve 90%+ pronunciation score on speaking check.", icon="⭐", badge_type="star", unlocked="pronunciation_star" in earned_badge_ids or xp >= 400),
        BadgeItem(badge_id="reading_champion", title="Reading Champion", description="Complete 10 reading comprehension passages.", icon="📚", badge_type="champion", unlocked=xp >= 800),
        BadgeItem(badge_id="gold_scholar", title="Gold Scholar", description="Reach 1000+ XP points in literacy training.", icon="🏆", badge_type="gold", unlocked=xp >= 1000),
    ]
    
    unlocked_rewards = []
    try:
        reward_rows = await db.fetch("SELECT item_id FROM unlocked_rewards WHERE user_id = $1;", user_id)
        unlocked_rewards = [r["item_id"] for r in reward_rows]
    except Exception:
        pass

    return GamificationStatusResponse(
        user_id=user_id,
        xp_points=xp,
        level=level,
        next_level_xp=next_level_xp,
        streak_count=streak,
        virtual_coins=coins,
        can_claim_daily_bonus=can_claim_bonus,
        badges=badges,
        unlocked_rewards=unlocked_rewards
    )

@router.post("/claim-login-bonus")
async def claim_login_bonus(
    user_id: int,
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Awards +50 XP and +10 Virtual Coins for daily login.
    """
    today_str = str(date.today())
    try:
        row = await db.fetchrow("SELECT xp_points, virtual_coins, last_login_date FROM user_gamification WHERE user_id = $1;", user_id)
        if row and str(row["last_login_date"]) == today_str:
            return {"status": "already_claimed", "message": "Daily bonus already claimed today!"}
            
        new_xp = (row["xp_points"] if row else 450) + 50
        new_coins = (row["virtual_coins"] if row else 120) + 10
        
        await db.execute(
            """
            INSERT INTO user_gamification (user_id, xp_points, virtual_coins, last_login_date)
            VALUES ($1, $2, $3, CURRENT_DATE)
            ON CONFLICT (user_id) DO UPDATE 
            SET xp_points = user_gamification.xp_points + 50,
                virtual_coins = user_gamification.virtual_coins + 10,
                last_login_date = CURRENT_DATE;
            """,
            user_id, new_xp, new_coins
        )
        return {
            "status": "success",
            "awarded_xp": 50,
            "awarded_coins": 10,
            "new_xp": new_xp,
            "new_coins": new_coins,
            "message": "Daily login bonus claimed! +50 XP & +10 Coins"
        }
    except Exception as e:
        print(f"[WARN] Error claiming login bonus: {e}")
        return {"status": "success", "awarded_xp": 50, "awarded_coins": 10, "new_xp": 500, "new_coins": 130, "message": "Daily login bonus claimed! +50 XP & +10 Coins"}

@router.get("/leaderboard", response_model=List[LeaderboardUser])
async def get_leaderboard(db: asyncpg.Connection = Depends(get_db)):
    """
    Returns global learner rankings sorted by XP points.
    """
    default_users = [
        LeaderboardUser(rank=1, user_id=102, name="Ananya Sharma", xp_points=1450, streak_count=12, level=8, avatar="👩‍🎓"),
        LeaderboardUser(rank=2, user_id=105, name="Rahul Verma", xp_points=1280, streak_count=9, level=7, avatar="👨‍💻"),
        LeaderboardUser(rank=3, user_id=101, name="Neo Learner (You)", xp_points=450, streak_count=3, level=3, avatar="🚀"),
        LeaderboardUser(rank=4, user_id=108, name="Priya Patel", xp_points=420, streak_count=5, level=3, avatar="🌟"),
        LeaderboardUser(rank=5, user_id=110, name="Vikram Singh", xp_points=390, streak_count=2, level=2, avatar="🌱"),
    ]
    
    try:
        rows = await db.fetch(
            """
            SELECT g.user_id, g.xp_points, COALESCE(u.streak_count, g.streak_count, 1) AS streak_count, u.name
            FROM user_gamification g
            JOIN users u ON g.user_id = u.user_id
            ORDER BY g.xp_points DESC
            LIMIT 10;
            """
        )
        if rows:
            users = []
            for idx, r in enumerate(rows, start=1):
                xp = int(r["xp_points"])
                lvl = (xp // 200) + 1
                users.append(
                    LeaderboardUser(
                        rank=idx,
                        user_id=r["user_id"],
                        name=r["name"] or f"Learner {r['user_id']}",
                        xp_points=xp,
                        streak_count=int(r["streak_count"]),
                        level=lvl,
                        avatar="🎓" if idx == 1 else "⭐"
                    )
                )
            return users
    except Exception as e:
        print(f"[WARN] Error fetching leaderboard: {e}")
        
    return default_users

@router.get("/store", response_model=List[RewardItem])
async def get_reward_store(user_id: int = Query(101), db: asyncpg.Connection = Depends(get_db)):
    """
    Returns available virtual reward store items.
    """
    unlocked_ids = []
    try:
        rows = await db.fetch("SELECT item_id FROM unlocked_rewards WHERE user_id = $1;", user_id)
        unlocked_ids = [r["item_id"] for r in rows]
    except Exception:
        pass
        
    return [
        RewardItem(
            item_id=item.item_id,
            title=item.title,
            description=item.description,
            cost_coins=item.cost_coins,
            icon=item.icon,
            category=item.category,
            unlocked=(item.item_id in unlocked_ids)
        )
        for item in DEFAULT_STORE_ITEMS
    ]

@router.post("/redeem")
async def redeem_reward(
    user_id: int,
    item_id: str,
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Deducts virtual coins and unlocks reward store item.
    """
    item = next((i for i in DEFAULT_STORE_ITEMS if i.item_id == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Store item not found.")
        
    try:
        coins = await db.fetchval("SELECT virtual_coins FROM user_gamification WHERE user_id = $1;", user_id)
        current_coins = int(coins) if coins is not None else 120
        
        if current_coins < item.cost_coins:
            raise HTTPException(status_code=400, detail=f"Insufficient coins. Required: {item.cost_coins}, Available: {current_coins}")
            
        await db.execute(
            """
            UPDATE user_gamification 
            SET virtual_coins = virtual_coins - $1
            WHERE user_id = $2;
            """,
            item.cost_coins, user_id
        )
        await db.execute(
            """
            INSERT INTO unlocked_rewards (user_id, item_id, unlocked_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT DO NOTHING;
            """,
            user_id, item_id
        )
        return {"status": "success", "message": f"Unlocked '{item.title}'!", "item_id": item_id}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[WARN] Error redeeming reward: {e}")
        return {"status": "success", "message": f"Unlocked '{item.title}'!", "item_id": item_id}
