import sys
from datetime import date, time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "outils"))
from ticket import Ticket, horaires_paris, suivi, taille_mnq  # noqa: E402


def test_horaires_asie_apres_changement_heure_us():
    h = horaires_paris("asie", date(2026, 11, 2))
    assert h["debut"].strftime("%H:%M") == "02:00"
    assert h["plan"].strftime("%H:%M") == "01:30"


def test_horaires_asie_semaine_decalee_octobre():
    # 26/10/2026 : l'Europe est déjà à l'heure d'hiver, pas les États-Unis -> 01:00 Paris.
    assert horaires_paris("asie", date(2026, 10, 26))["debut"].strftime("%H:%M") == "01:00"


def test_horaires_ny():
    h = horaires_paris("ny", date(2026, 11, 3))
    assert (h["debut"].strftime("%H:%M"), h["fin"].strftime("%H:%M")) == ("15:30", "17:00")


@pytest.mark.parametrize("stop,attendu", [(10, 10), (12, 8), (15, 6), (20, 5), (150, 1)])
def test_taille_a_plus(stop, attendu):
    assert taille_mnq(stop, "A+") == attendu


def test_taille_b_et_mode_test():
    assert taille_mnq(10, "B") == 1
    assert taille_mnq(10, "A+", mode_test=True) == 1


def test_ticket_t4_reese():
    t = Ticket("achat", 30735.25, 30724.75, 30759.5, "A+", "asie", cible=30794)
    assert t.stop_points == 10.5
    assert round(t.r_tp1, 2) == 2.31
    assert t.taille == 9
    assert t.problemes() == []
    txt = t.texte(date(2026, 11, 2))
    assert "LIMITE 9 MNQ @ 30 735.25" in txt


def test_ticket_refuse_tp1_sous_1r():
    t = Ticket("vente", 100, 110, 95, "B", "asie")
    assert t.problemes()


def test_ticket_stop_mauvais_cote():
    with pytest.raises(ValueError):
        Ticket("achat", 100, 105, 120, "B", "asie")


def test_annulation_en_heure_de_paris():
    t = Ticket("achat", 100, 90, 115, "B", "asie", annulation_ny=time(20, 45))
    assert "02:45 (Paris)" in t.texte(date(2026, 11, 2))


def test_suivi():
    t = Ticket("vente", 31412.75, 31427.75, 31391.5, "B", "asie")
    assert "+1.42 R" in suivi("sortie", t, 31391.5)
    assert "31397.75" in suivi("1r", t)
