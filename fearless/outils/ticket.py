"""Ticket de signal FEARLESS : taille, R, horaires et texte Telegram prêt à recopier.

Aucun ordre n'est passé par cet outil : il ne fait que calculer et formater.

Exemple :
    python ticket.py --sens achat --entree 30735.25 --stop 30724.75 --tp1 30759.5 \
        --cible 30794 --verdict A+ --session asie --type limite --annulation 20:45
"""
from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
PARIS = ZoneInfo("Europe/Paris")

TICK = 0.25
DOLLARS_PAR_POINT = {"MNQ": 2.0, "NQ": 20.0}
RISQUE_A_PLUS = 200.0  # $ visés pour un A+
TAILLE_B = 1  # MNQ

# Horaires New York de chaque session : plan, début, dernière entrée, fin.
SESSIONS = {
    "asie": {"plan": time(19, 30), "debut": time(20, 0), "derniere_entree": time(20, 45), "fin": time(23, 30)},
    "ny": {"plan": time(9, 0), "debut": time(9, 30), "derniere_entree": time(11, 0), "fin": time(11, 0)},
}


def arrondi_tick(prix: float) -> float:
    return round(round(prix / TICK) * TICK, 2)


def ny_vers_paris(jour_ny: date, heure_ny: time) -> datetime:
    return datetime.combine(jour_ny, heure_ny, tzinfo=NY).astimezone(PARIS)


def horaires_paris(session: str, jour_ny: date) -> dict[str, datetime]:
    """Horaires de la session en heure de Paris, en tenant compte des changements d'heure."""
    return {k: ny_vers_paris(jour_ny, v) for k, v in SESSIONS[session].items()}


def taille_mnq(stop_points: float, verdict: str, mode_test: bool = False) -> int:
    """B = 1 MNQ ; A+ = floor(200 $ / risque d'un MNQ), au moins 1. En mode test : 1 MNQ pour tout."""
    if stop_points <= 0:
        raise ValueError("le stop doit être à au moins un tick de l'entrée")
    if mode_test or verdict.upper() != "A+":
        return TAILLE_B
    return max(1, math.floor(RISQUE_A_PLUS / (stop_points * DOLLARS_PAR_POINT["MNQ"])))


@dataclass
class Ticket:
    sens: str  # "achat" ou "vente"
    entree: float
    stop: float
    tp1: float
    verdict: str  # "A+" ou "B"
    session: str  # "asie" ou "ny"
    type_ordre: str = "limite"  # "limite" ou "marché"
    cible: float | None = None  # DOL pour le reste
    annulation_ny: time | None = None
    mode_test: bool = False
    raison: str = ""

    def __post_init__(self) -> None:
        self.sens = self.sens.lower()
        if self.sens not in ("achat", "vente"):
            raise ValueError("sens = achat ou vente")
        self.entree, self.stop, self.tp1 = map(arrondi_tick, (self.entree, self.stop, self.tp1))
        if self.cible is not None:
            self.cible = arrondi_tick(self.cible)
        d = 1 if self.sens == "achat" else -1
        if d * (self.entree - self.stop) <= 0:
            raise ValueError("stop du mauvais côté de l'entrée")
        if d * (self.tp1 - self.entree) <= 0:
            raise ValueError("TP1 du mauvais côté de l'entrée")
        if self.cible is not None and d * (self.cible - self.tp1) < 0:
            raise ValueError("la cible finale doit être au-delà du TP1")

    @property
    def stop_points(self) -> float:
        return abs(self.entree - self.stop)

    @property
    def r_tp1(self) -> float:
        return abs(self.tp1 - self.entree) / self.stop_points

    @property
    def r_cible(self) -> float | None:
        return None if self.cible is None else abs(self.cible - self.entree) / self.stop_points

    @property
    def taille(self) -> int:
        return taille_mnq(self.stop_points, self.verdict, self.mode_test)

    @property
    def risque_dollars(self) -> float:
        return self.taille * self.stop_points * DOLLARS_PAR_POINT["MNQ"]

    def problemes(self) -> list[str]:
        """Règles bloquantes de la v8 que le ticket peut vérifier seul."""
        p = []
        if self.r_tp1 < 1:
            p.append(f"TP1 à {self.r_tp1:.2f} R : il faut au moins 1 R")
        return p

    def texte(self, jour_ny: date | None = None) -> str:
        fleche = "🟢 ACHAT" if self.sens == "achat" else "🔴 VENTE"
        session = "Asie" if self.session == "asie" else "New York"
        lignes = [
            f"{fleche} NQ — {self.verdict} — session {session}" + (" (mode test)" if self.mode_test else ""),
            "",
            f"Ordre : {self.type_ordre.upper()} {self.taille} MNQ @ {self.entree:,.2f}".replace(",", " "),
            f"Stop : {self.stop:,.2f}  ({self.stop_points:g} pts, risque {self.risque_dollars:.0f} $)".replace(",", " "),
            f"TP1 (60 %) : {self.tp1:,.2f}  ({self.r_tp1:.2f} R)".replace(",", " "),
        ]
        if self.cible is not None:
            lignes.append(f"Reste : {self.cible:,.2f}  ({self.r_cible:.2f} R)".replace(",", " "))
        if self.annulation_ny is not None:
            jour = jour_ny or datetime.now(NY).date()
            paris = ny_vers_paris(jour, self.annulation_ny)
            lignes.append(f"Annuler si non servi à {paris:%H:%M} (Paris)")
        if self.raison:
            lignes += ["", self.raison]
        for pb in self.problemes():
            lignes.append(f"⚠️ {pb}")
        return "\n".join(lignes)


def suivi(evenement: str, ticket: Ticket, prix: float | None = None, contrats: int | None = None) -> str:
    """Messages de suivi Telegram, envoyés en réponse au signal."""
    e = evenement.lower()
    sens = "long" if ticket.sens == "achat" else "short"
    if e == "servi":
        return f"✅ Ordre servi : {sens} {ticket.taille} MNQ @ {ticket.entree:.2f}. Stop {ticket.stop:.2f}, TP1 {ticket.tp1:.2f}."
    if e == "be":
        return f"🔒 Stop remonté à l'entrée ({ticket.entree:.2f}) : modèle prouvé."
    if e == "1r":
        d = 1 if ticket.sens == "achat" else -1
        return f"🔒 Stop déplacé à +1 R : {arrondi_tick(ticket.entree + d * ticket.stop_points):.2f}."
    if e == "tp1":
        n = contrats if contrats is not None else max(1, round(ticket.taille * 0.6))
        return f"💰 TP1 touché : {n} MNQ sortis à {ticket.tp1:.2f} (+{ticket.r_tp1:.2f} R sur cette partie)."
    if e == "sortie":
        if prix is None:
            raise ValueError("prix de sortie manquant")
        d = 1 if ticket.sens == "achat" else -1
        r = d * (prix - ticket.entree) / ticket.stop_points
        return f"🏁 Sortie à {arrondi_tick(prix):.2f} : {r:+.2f} R."
    if e == "stop":
        return f"❌ Stop touché à {ticket.stop:.2f} : −1 R. Session terminée."
    if e == "annule":
        return "🚫 Ordre annulé : non servi à l'heure limite. Retire-le de la plateforme."
    raise ValueError(f"événement inconnu : {evenement}")


def _heure(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def main(argv: list[str] | None = None) -> None:
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("--sens", required=True, choices=["achat", "vente"])
    a.add_argument("--entree", type=float, required=True)
    a.add_argument("--stop", type=float, required=True)
    a.add_argument("--tp1", type=float, required=True)
    a.add_argument("--cible", type=float)
    a.add_argument("--verdict", required=True, choices=["A+", "B"])
    a.add_argument("--session", required=True, choices=list(SESSIONS))
    a.add_argument("--type", dest="type_ordre", default="limite", choices=["limite", "marché"])
    a.add_argument("--annulation", type=_heure, help="heure de New York, HH:MM")
    a.add_argument("--test", action="store_true", help="mode test : 1 MNQ pour tout")
    a.add_argument("--raison", default="")
    x = a.parse_args(argv)
    t = Ticket(x.sens, x.entree, x.stop, x.tp1, x.verdict, x.session, x.type_ordre, x.cible,
               x.annulation, x.test, x.raison)
    print(t.texte())


if __name__ == "__main__":
    main()
