// ─────────────────────────────────────────────────────────────
// ELENCO CAPI DELLA COLLEZIONE
// Per aggiungere un capo: copia una riga e cambia i valori.
//  - id:         nome breve per il link (minuscolo, con trattini)
//  - nome:       nome che appare sul sito
//  - descrizione: (facoltativa) frase breve sotto il nome
//  - categorie:  una o più tra pantaloni capispalla tailleurs top maglieria abiti
//  - foto:       file in images/products/ — la PRIMA è quella in griglia
//                (ghost mannequin), la seconda appare passando col mouse
// ─────────────────────────────────────────────────────────────
var PRODOTTI = [
  { id: "abito-camicia-floreale", nome: "Abito camicia floreale", categorie: "abiti", foto: ["Abito_camicia_floreale.webp"] },
  { id: "maxi-dress-floreale", nome: "Maxi dress floreale", categorie: "abiti", foto: ["Maxi_dress_floreale.webp"] },
  { id: "pantaloni-balloon", nome: "Pantaloni balloon", categorie: "pantaloni", foto: ["Pantaloni_balloon.webp"] },
  { id: "pantapalazzo", nome: "Pantapalazzo", categorie: "pantaloni", foto: ["Pantapalazzo.webp"] },
  { id: "giacca-in-pelle", nome: "Giacca in pelle", categorie: "capispalla", foto: ["Giacca_in_pelle.webp"] },
  { id: "giacca-in-pelle-con-collo-alto", nome: "Giacca in pelle con collo alto", categorie: "capispalla", foto: ["Giacca_in_pelle_con_collo_alto.webp"] },
  { id: "tailleur", nome: "Tailleur", categorie: "tailleurs", foto: ["Tailleur.webp"] },
  { id: "completo-in-velluto-a-costine", nome: "Completo in velluto a costine", categorie: "tailleurs", foto: ["Completo_in_velluto_a_costine.webp"] },
  { id: "margot", nome: "Margot", descrizione: "Cardigan girocollo, bottoni rivestiti e coulisse in vita", categorie: "maglieria top", foto: ["Cardigan_con_bottoni_rivestiti_still.webp", "Cardigan_con_bottoni_rivestiti.webp"] },
  { id: "cherie", nome: "Cherie", descrizione: "Scollo a V, profili a contrasto e taschini bordati a catena", categorie: "maglieria top", foto: ["Cardigan_con_tasche_still.webp", "Cardigan_con_tasche.webp"] },
  { id: "nora", nome: "Nora", descrizione: "Coste verticali, manica ampia e polsino lungo", categorie: "maglieria top", foto: ["Maglione_con_manica_scesa_still.webp", "Maglione_con_manica_scesa.webp"] },
  { id: "ines", nome: "Ines", descrizione: "Polo a coste sottili con bottoncini rivestiti", categorie: "maglieria top", foto: ["Polo_in_maglia_still.webp", "Polo_in_maglia.webp"] },
  { id: "lou", nome: "Lou", descrizione: "Smanicato con drappeggio laterale e bottoni gioiello", categorie: "maglieria top", foto: ["Top_in_maglia_con_bottoncini_still.webp", "Top_in_maglia_con_bottoncini.webp"] },
  { id: "audrey", nome: "Audrey", descrizione: "Righe tono su tono, tasche applicate e polsi a balza", categorie: "maglieria top", foto: ["Cardigan_rigato_con_polsini_a_balza.webp", "Audrey_modella_1.webp"] },
  { id: "olivia", nome: "Olivia", descrizione: "Scollo a V con piccolo ricamo di olive sul petto", categorie: "maglieria top", foto: ["Cardigan_scollo_a_V_con_ricamo.webp", "Olivia_modella_1.webp", "Olivia_dettaglio.webp"] },
  { id: "grace", nome: "Grace", descrizione: "Collo alla coreana, vita segnata e peplo, bottoni dorati", categorie: "maglieria top", foto: ["Cardigan_peplum_con_bottoni_gioiello.webp", "Grace_modella_1.webp"] },
  { id: "vera", nome: "Vera", descrizione: "Abbottonatura ondulata e grandi bottoni rivestiti", categorie: "maglieria top", foto: ["Cardigan_peplum_con_bottoni_rivestiti.webp", "Vera_modella_1.webp"] },
  { id: "dalia", nome: "Dalia", descrizione: "Gonna midi svasata a coste larghe", categorie: "maglieria", foto: ["Gonna_svasata_a_coste.webp", "Dalia_modella_1.webp"] },
  { id: "alba", nome: "Alba", descrizione: "Longuette con finte patte abbottonate", categorie: "maglieria", foto: ["Gonna_longuette_in_maglia.webp", "Alba_modella_1.webp"] },
  { id: "lea", nome: "Lea", descrizione: "A portafoglio, vita a coste e abbottonatura laterale", categorie: "maglieria top", foto: ["Cardigan_incrociato.webp", "Lea_modella_1.webp"] },
  { id: "lola", nome: "Lola", descrizione: "Manica a kimono, collana gioiello applicata e cintura in vita", categorie: "maglieria top", foto: ["Maglia_con_collana_gioiello_e_cintura.webp", "Lola_modella_1.webp"] },
  { id: "mia", nome: "Mia", descrizione: "Scollo quadro e arricciatura laterale con bottoni gioiello", categorie: "maglieria top", foto: ["Maglia_scollo_quadro_con_bottoni_gioiello.webp", "Mia_modella_1.webp"] },
  { id: "nina", nome: "Nina", descrizione: "Lupetto con fiocco applicato sulla spalla", categorie: "maglieria top", foto: ["Maglia_collo_alto_con_fiocco.webp"] },
  { id: "iris", nome: "Iris", descrizione: "Collo morbido a cascata, manica ad aletta e drappeggio sui fianchi", categorie: "maglieria top", foto: ["Iris.webp", "Iris_modella_1.webp"] },
  { id: "tuta-set", nome: "Tuta set", categorie: "pantaloni top", foto: ["Tuta_set.webp"] },
];
