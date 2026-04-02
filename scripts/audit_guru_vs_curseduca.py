"""
audit_guru_vs_curseduca.py

Chama diretamente a API da Guru e a API do CursEduca,
guarda os dados em ficheiros JSON e faz o match:

  0 subs ativas na Guru  → deve ser INACTIVE no CursEduca
  ≥1 sub ativa na Guru   → deve ser ACTIVE  no CursEduca
"""

import sys
import json
import time
import requests
from collections import defaultdict
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8')

# ═══════════════════════════════════════════════════════
# CREDENCIAIS
# ═══════════════════════════════════════════════════════

GURU_TOKEN     = "a105bbd0-2a5c-4966-903b-f45c904fd4d7|M67btixnQ4l6WkqJus2qtTxNUokrXVWZ3Alb57QNc91bb216"
GURU_BASE_URL  = "https://digitalmanager.guru/api/v2"

CURSEDUCA_URL  = "https://prof.curseduca.pro"
CURSEDUCA_KEY  = "ce9ef2a4afef727919473d38acafe10109c4faa8"
CURSEDUCA_JWT  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjozLCJ1dWlkIjoiYmZiNmExNjQtNmE5MC00MGFhLTg3OWYtYzEwNGIyZTZiNWVmIiwibmFtZSI6IlBlZHJvIE1pZ3VlbCBQZXJlaXJhIFNpbcO1ZXMgU2FudG9zIiwiZW1haWwiOiJjb250YWN0b3NAc2VycmlxdWluaG8uY29tIiwiaW1hZ2UiOiIvYXBwbGljYXRpb24vaW1hZ2VzL3VwbG9hZHMvMy8iLCJyb2xlcyI6WyJBRE1JTiJdLCJ0ZW5hbnRzIjpbXX0sImlhdCI6MTc1ODE5MDgwMH0.vI_Y9l7oZVIV4OT9XG7LWDIma-E7fcRkVYM7FOCxTds"

# IDs dos grupos Clareza no CursEduca
CURSEDUCA_GROUP_IDS = [6, 7]   # 6=Mensal, 7=Anual

# Status Guru que consideramos ATIVOS
GURU_ACTIVE_STATUSES = {"active", "pastdue", "trialing", "paid"}
# Threshold pending stale (dias)
PENDING_STALE_DAYS = 7

OUTPUT_DIR = "."

# ═══════════════════════════════════════════════════════
# 1. GURU — buscar TODAS as subscrições (cursor pagination)
# ═══════════════════════════════════════════════════════

def is_pending_stale(sub: dict) -> bool:
    """Pending com mais de PENDING_STALE_DAYS dias = cancelado efectivo."""
    dates = sub.get("dates") or {}
    last_status_at = dates.get("last_status_at") or sub.get("updated_at")
    if not last_status_at:
        return True
    try:
        dt = datetime.fromisoformat(last_status_at.replace("Z", "+00:00"))
        age_days = (datetime.now(timezone.utc) - dt).days
        return age_days > PENDING_STALE_DAYS
    except Exception:
        return True

def effective_status(sub: dict) -> str:
    """Devolve o status efectivo, tratando pending stale como canceled."""
    raw = (sub.get("last_status") or sub.get("status") or "").lower()
    if raw == "pending" and is_pending_stale(sub):
        return "canceled"
    return raw

def fetch_all_guru_subscriptions() -> list:
    print("\n═══ GURU API — a buscar todas as subscrições ═══")
    headers = {"Authorization": f"Bearer {GURU_TOKEN}", "Content-Type": "application/json"}
    all_subs = []
    cursor = None
    page = 0

    while True:
        page += 1
        params = {"per_page": 50}
        if cursor:
            params["cursor"] = cursor

        resp = requests.get(f"{GURU_BASE_URL}/subscriptions", headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        subs = data.get("data", data) if isinstance(data, dict) else data
        if not isinstance(subs, list):
            print(f"   ⚠️  Resposta inesperada: {type(subs)}")
            break

        all_subs.extend(subs)
        print(f"   Página {page}: +{len(subs)} ({len(all_subs)} total)")

        # Cursor para próxima página (está no top-level da resposta)
        has_more = data.get("has_more_pages", 0) if isinstance(data, dict) else 0
        cursor = data.get("next_cursor") if isinstance(data, dict) else None
        if not has_more or not cursor:
            break
        time.sleep(0.3)

    print(f"✅ Guru: {len(all_subs)} subscrições totais")
    return all_subs

# ═══════════════════════════════════════════════════════
# 2. CURSEDUCA — buscar membros de ambos os grupos
# ═══════════════════════════════════════════════════════

def fetch_curseduca_members(group_id: int) -> list:
    headers = {
        "Authorization": f"Bearer {CURSEDUCA_JWT}",
        "api_key": CURSEDUCA_KEY,
        "Content-Type": "application/json",
    }
    all_members = []
    offset = 0
    limit = 100
    page = 0

    while True:
        page += 1
        resp = requests.get(
            f"{CURSEDUCA_URL}/reports/group/members",
            headers=headers,
            params={"group": group_id, "groupId": group_id, "limit": limit, "offset": offset},
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        members = data.get("data", data) if isinstance(data, dict) else data
        if not isinstance(members, list):
            break
        all_members.extend(members)
        print(f"   Grupo {group_id} pág {page}: +{len(members)} ({len(all_members)} total)")
        if len(members) < limit:
            break
        offset += limit
        time.sleep(0.2)

    return all_members

def fetch_all_curseduca_members() -> list:
    print("\n═══ CURSEDUCA API — a buscar membros ═══")
    all_members = []
    for gid in CURSEDUCA_GROUP_IDS:
        print(f"   → Grupo {gid}...")
        members = fetch_curseduca_members(gid)
        for m in members:
            m["_groupId"] = gid
        all_members.extend(members)
        time.sleep(0.5)
    print(f"✅ CursEduca: {len(all_members)} registos (com duplicados por grupo)")
    return all_members

# ═══════════════════════════════════════════════════════
# 3. MATCH
# ═══════════════════════════════════════════════════════

def do_match(guru_subs: list, curseduca_members: list) -> dict:
    print("\n═══ MATCH ═══")

    # Indexar Guru por email → lista de subs
    # A API da Guru usa o campo "contact" (não "subscriber")
    guru_by_email = defaultdict(list)
    for sub in guru_subs:
        contact = sub.get("contact") or sub.get("subscriber") or {}
        email = contact.get("email", "").strip().lower()
        if email:
            guru_by_email[email].append(sub)

    # Indexar CursEduca por email (pode haver 1 membro em ambos os grupos)
    ce_by_email = defaultdict(list)
    for m in curseduca_members:
        email = (m.get("email") or "").strip().lower()
        if email:
            ce_by_email[email].append(m)

    results = {
        "should_inactivate": [],   # 0 subs ativas na Guru
        "should_stay_active": [],  # ≥1 sub ativa na Guru
        "not_in_guru": [],         # email CursEduca não existe na Guru
        "summary": {}
    }

    for email, ce_list in ce_by_email.items():
        subs = guru_by_email.get(email, [])

        # Calcular subs ativas e canceladas
        active_subs = []
        canceled_subs = []
        for s in subs:
            eff = effective_status(s)
            if eff in GURU_ACTIVE_STATUSES:
                active_subs.append(s)
            else:
                canceled_subs.append(s)

        # Info do membro CursEduca (usar o 1º registo)
        member = ce_list[0]
        ce_id = member.get("id") or member.get("memberId")
        ce_situation = member.get("situation") or member.get("status") or "?"

        entry = {
            "email": email,
            "curseduca_id": ce_id,
            "curseduca_situation": ce_situation,
            "curseduca_groups": [m.get("_groupId") for m in ce_list],
            "guru_total_subs": len(subs),
            "guru_active_subs": len(active_subs),
            "guru_canceled_subs": len(canceled_subs),
            "guru_active_plans": [
                {
                    "id": s.get("id"),
                    "status": effective_status(s),
                    "product": (s.get("product") or {}).get("name"),
                    "charged_every_days": s.get("charged_every_days"),
                    "started_at": s.get("started_at"),
                }
                for s in active_subs
            ],
        }

        if not subs:
            results["not_in_guru"].append(entry)
        elif len(active_subs) == 0:
            results["should_inactivate"].append(entry)
        else:
            results["should_stay_active"].append(entry)

    # Resumo de status
    all_statuses = defaultdict(int)
    for sub in guru_subs:
        all_statuses[effective_status(sub)] += 1

    results["summary"] = {
        "curseduca_unique_emails": len(ce_by_email),
        "guru_total_subs": len(guru_subs),
        "guru_by_status": dict(all_statuses),
        "should_inactivate": len(results["should_inactivate"]),
        "should_stay_active": len(results["should_stay_active"]),
        "not_in_guru": len(results["not_in_guru"]),
    }

    return results

# ═══════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════

if __name__ == "__main__":
    # 1. Buscar dados
    guru_subs = fetch_all_guru_subscriptions()
    ce_members = fetch_all_curseduca_members()

    # 2. Guardar raw
    with open(f"{OUTPUT_DIR}/guru_subscriptions_raw.json", "w", encoding="utf-8") as f:
        json.dump(guru_subs, f, ensure_ascii=False, indent=2)
    print(f"\n💾 Guru raw → guru_subscriptions_raw.json ({len(guru_subs)} registos)")

    with open(f"{OUTPUT_DIR}/curseduca_members_raw.json", "w", encoding="utf-8") as f:
        json.dump(ce_members, f, ensure_ascii=False, indent=2)
    print(f"💾 CursEduca raw → curseduca_members_raw.json ({len(ce_members)} registos)")

    # 3. Match
    match = do_match(guru_subs, ce_members)

    with open(f"{OUTPUT_DIR}/match_results.json", "w", encoding="utf-8") as f:
        json.dump(match, f, ensure_ascii=False, indent=2)
    print(f"💾 Match → match_results.json")

    # 4. Relatório
    s = match["summary"]
    print("\n══════════════════════════════════════")
    print("         RELATÓRIO FINAL              ")
    print("══════════════════════════════════════")
    print(f"  CursEduca emails únicos : {s['curseduca_unique_emails']}")
    print(f"  Guru subscrições totais : {s['guru_total_subs']}")
    print(f"  Guru por status         : {s['guru_by_status']}")
    print()
    print(f"  ✅ Devem ficar ATIVOS    : {s['should_stay_active']}")
    print(f"  ❌ Devem ser INATIVADOS  : {s['should_inactivate']}")
    print(f"  ❓ Não estão na Guru     : {s['not_in_guru']}")
    print("══════════════════════════════════════")

    # 5. Primeiros 10 a inativar
    if match["should_inactivate"]:
        print(f"\n🔴 Primeiros 10 a INATIVAR:")
        for entry in match["should_inactivate"][:10]:
            print(f"   {entry['email']}  |  CE_ID={entry['curseduca_id']}  |  Guru subs={entry['guru_total_subs']} (0 ativas, {entry['guru_canceled_subs']} canceladas)")

    if match["not_in_guru"]:
        print(f"\n❓ Primeiros 5 NÃO na Guru (só CursEduca):")
        for entry in match["not_in_guru"][:5]:
            print(f"   {entry['email']}  |  CE_ID={entry['curseduca_id']}")
